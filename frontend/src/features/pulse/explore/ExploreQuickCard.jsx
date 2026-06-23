// ExploreQuickCard — right-rail account card for the Pulse Explorer.
//
// Distinct from the 1714-line PulseQuickCard used on the Search tab —
// that one takes a `company` payload from pulse-search; this one takes a
// `row` payload straight from pulse-explore (V6-rich: latitude, vertical,
// top_forwarders, top_dimensions, opportunity scores, freshness).
//
// Sections:
//   1. Identity        (name + domain + location)
//   2. Freshness chip  (Live · 2h ago | Saved · 14d ago | Directory)
//   3. Opportunity     (top 2 chips: type · score)
//   4. KPI strip       (TEU · Shipments · Revenue · Employees)
//   5. Top Origin → Destination  (top 2 lanes + top forwarder, chip-style)
//   6. Contact (from DCS seed: consignee_email_1 + consignee_phone_1)
//   7. Actions         (Open in Command Center · Save to list · Refresh)

import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Bookmark, ExternalLink, MapPin, RefreshCw,
  TrendingUp, Ship, Building2, X, Search,
} from 'lucide-react';
import { useExplorer } from '@/components/explorer/ExplorerContext';
import { useImportYetiRefresh } from './useImportYetiRefresh';

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const num = Number(n);
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
  return num.toLocaleString();
}

function fmtAge(hours) {
  if (hours == null) return null;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 14) return `${Math.round(days)}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function FreshnessChip({ freshness }) {
  const chip = freshness?.chip ?? 'directory';
  const age = fmtAge(freshness?.age_hours);
  const styles = {
    live: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    saved: 'bg-amber-100 text-amber-800 ring-amber-200',
    directory: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  const labels = { live: 'Live', saved: 'Saved', directory: 'Directory' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${styles[chip] ?? styles.directory}`}>
      {labels[chip] ?? 'Directory'}
      {age && <span className="text-[10px] opacity-70">· {age}</span>}
    </span>
  );
}

const OPP_STYLES = {
  vulnerable: 'bg-red-50 text-red-700 ring-red-200',
  consolidation: 'bg-amber-50 text-amber-700 ring-amber-200',
  velocity: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  defend: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
};
const OPP_LABELS = {
  vulnerable: 'Vulnerable incumbent',
  consolidation: 'Consolidation',
  velocity: 'High-velocity',
  defend: 'Defend & grow',
};

function topOpportunities(row) {
  const all = [
    { type: 'vulnerable', score: row.opportunity_vulnerable_score ?? 0 },
    { type: 'consolidation', score: row.opportunity_consolidation_score ?? 0 },
    { type: 'velocity', score: row.opportunity_velocity_score ?? 0 },
    { type: 'defend', score: row.opportunity_defend_score ?? 0 },
  ];
  return all.filter((o) => o.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
}

function OpportunityChips({ row }) {
  const ops = topOpportunities(row);
  if (ops.length === 0) {
    return <span className="text-[11px] text-slate-400 italic">No opportunity signals yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {ops.map((o) => (
        <span
          key={o.type}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${OPP_STYLES[o.type]}`}
        >
          {OPP_LABELS[o.type]}
          <span className="tabular-nums opacity-80">· {Math.round(o.score)}</span>
        </span>
      ))}
    </div>
  );
}

function KpiCell({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md border border-slate-100 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
        <Icon size={11} />{label}
      </div>
      <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function LaneChip({ lane }) {
  const text = typeof lane === 'string' ? lane : lane?.lane ?? lane?.route ?? '';
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 text-[10px] text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="truncate max-w-[180px]">{text}</span>
    </span>
  );
}

function ForwarderChip({ name }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-blue-50 ring-1 ring-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
      <span className="truncate max-w-[180px]">{name}</span>
    </span>
  );
}

function isCached24h(row) {
  const h = row?.freshness?.age_hours;
  return typeof h === 'number' && h < 24;
}

export default function ExploreQuickCard({ row, onClose, onSaveToList }) {
  const navigate = useNavigate();
  const [, setSp] = useSearchParams();
  const { setMode } = useExplorer();
  const refresh = useImportYetiRefresh();
  if (!row) return null;

  const location = [row.city, row.state, row.country].filter(Boolean).join(', ');
  const lanes = Array.isArray(row.top_dimensions) ? row.top_dimensions.slice(0, 2) : [];
  const topForwarder = Array.isArray(row.top_forwarders) ? row.top_forwarders[0] : null;
  const refreshDisabled = isCached24h(row) || refresh.isPending;

  // Directory-only rows live in lit_company_directory (the V6/Panjiva seed
  // dataset). They don't yet have a lit_companies row, so /app/companies/:id
  // would show an empty profile. The user has to search first to pull
  // ImportYeti data + create the lit_companies row. Live rows already
  // have a profile and can be opened directly.
  const hasLiveProfile = Array.isArray(row.data_sources) && row.data_sources.includes('live');

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header — name + close */}
      <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-slate-900">{row.company_name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            {row.domain ? (
              <a
                href={row.domain.startsWith('http') ? row.domain : `https://${row.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-blue-600 hover:underline"
              >
                {row.domain}<ExternalLink size={10} />
              </a>
            ) : (
              <span className="text-slate-400">No domain</span>
            )}
            {location && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-0.5 truncate">
                  <MapPin size={10} />{location}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          <X size={14} />
        </button>
      </header>

      {/* Freshness + provenance row */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-2 text-[11px]">
        <FreshnessChip freshness={row.freshness} />
        {row.industry && (
          <span className="text-slate-500 truncate">· {row.industry}</span>
        )}
        {row.vertical && row.vertical !== row.industry && (
          <span className="text-slate-400 truncate">· {row.vertical}</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Opportunity chips */}
        <section className="border-b border-slate-100 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Opportunities</div>
          <OpportunityChips row={row} />
        </section>

        {/* KPI grid */}
        <section className="border-b border-slate-100 px-3 py-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <KpiCell icon={Ship} label="TEU 12m" value={fmtNum(row.teu)} />
            <KpiCell icon={TrendingUp} label="Shipments 12m" value={fmtNum(row.shipments)} />
            <KpiCell icon={Ship} label="LCL 12m" value={fmtNum(row.lcl)} />
            <KpiCell icon={Building2} label="Employees" value={fmtNum(row.employee_count)} />
          </div>
        </section>

        {/* Contact details — pulled from DCS consignee_email_1 / phone fields
             when the directory row has them. Hidden when both are blank so
             we don't show a dead "Contact" section. */}
        {(row.consignee_email_1 || row.consignee_phone_1) && (
          <section className="border-b border-slate-100 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Contact</div>
            <div className="space-y-1 text-[12px]">
              {row.consignee_email_1 && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400 shrink-0">@</span>
                  <a href={`mailto:${row.consignee_email_1}`} className="text-cyan-700 hover:underline truncate">
                    {row.consignee_email_1}
                  </a>
                </div>
              )}
              {row.consignee_phone_1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 shrink-0">☎</span>
                  <a href={`tel:${row.consignee_phone_1}`} className="text-slate-700 hover:underline">
                    {row.consignee_phone_1}
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Top Origin → Destination */}
        {(lanes.length > 0 || topForwarder) && (
          <section className="border-b border-slate-100 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Top Origin → Destination</div>
            <div className="flex flex-wrap gap-1">
              {lanes.map((l, i) => <LaneChip key={`l${i}`} lane={l} />)}
              {topForwarder && <ForwarderChip name={topForwarder.name} />}
            </div>
            {topForwarder?.percent != null && (
              <div className="mt-1.5 text-[10px] text-slate-400">
                Top forwarder controls {Math.round(topForwarder.percent)}% of TEU
              </div>
            )}
          </section>
        )}

        {/* Annual revenue — V6 stores in millions of USD */}
        {row.revenue && (
          <section className="border-b border-slate-100 px-4 py-3 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Estimated annual revenue</div>
            <div className="font-semibold text-slate-900 tabular-nums">
              {(() => {
                const v = Number(row.revenue);
                if (!Number.isFinite(v)) return row.revenue;
                if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}B`;
                if (v >= 1) return `$${v.toFixed(2)}M`;
                return `$${(v * 1000).toFixed(0)}k`;
              })()}
              {row.data_sources?.includes('live') ? null : (
                <span className="ml-1.5 text-[10px] font-normal text-slate-400">(directory estimate)</span>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Actions */}
      <footer className="border-t border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1.5">
        {hasLiveProfile ? (
          <button
            type="button"
            onClick={() => navigate(`/app/companies/${row.id}`)}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-2 hover:bg-slate-700"
          >
            Open in Command Center <ArrowRight size={12} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                // Set the company name as the query, then switch to the Company
                // Search tab via the SAME setMode() the tab bar uses (proven to
                // work). navigate(?tab=) wasn't reliably switching the tab while
                // the Pulse tab stayed mounted.
                setSp((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('q', row.company_name ?? '');
                  return next;
                }, { replace: true });
                setMode('company');
                onClose?.();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-2 hover:bg-slate-700"
              title="Run a fresh search to pull live shipment data, then this company will be openable in Command Center"
            >
              <Search size={12} /> Search for live data
            </button>
            <p className="text-[10px] text-slate-500 leading-snug text-center">
              Directory data only. Search first to pull live shipments + contacts,
              then the company opens in Command Center.
            </p>
          </>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSaveToList?.(row)}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-white ring-1 ring-slate-200 text-slate-700 text-xs px-2 py-1.5 hover:bg-slate-50"
          >
            <Bookmark size={12} />Save to list
          </button>
          <button
            type="button"
            onClick={() => refresh.mutate({ companyId: row.id })}
            disabled={refreshDisabled || !hasLiveProfile}
            title={
              !hasLiveProfile ? 'Search this company first to enable refresh'
              : isCached24h(row) ? 'Cached — under 24h old'
              : 'Refresh from ImportYeti'
            }
            className="inline-flex items-center justify-center gap-1 rounded-md bg-white ring-1 ring-slate-200 text-slate-700 text-xs px-2 py-1.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={refresh.isPending ? 'animate-spin' : ''} />
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </footer>
    </div>
  );
}
