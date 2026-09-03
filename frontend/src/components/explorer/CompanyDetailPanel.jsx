import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, MapPin, Building2, Ship, TrendingUp,
  Phone, Loader2, Linkedin, Sparkles,
} from 'lucide-react';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import { countryFlag, compactLocation } from '@/lib/explorer/countryFlags';
import { springs, useReducedMotion } from '@/lib/motion';
import { enrichCompanyLive } from '@/api/ai';

/**
 * LIT-native company detail panel — the inline "business card" that opens when
 * a search result is clicked, replacing the old navigate-straight-to-profile
 * flow (Google-Maps behavior: click → detail in place, map keeps context).
 *
 * Data is what the search row + shipment intel already carry — NO Google
 * Places (cost/ToS). "Open full profile" is the deliberate deeper action;
 * "View on Google Maps" is a free deep link.
 */
function fmtCompact(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return v.toLocaleString();
}
function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2).replace(/\.0+$/, '')}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2).replace(/\.0+$/, '')}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v.toLocaleString()}`;
}

export default function CompanyDetailPanel({ row, onClose, onOpenFull, onSave }) {
  const reduce = useReducedMotion();
  // Live enrichment (Apollo org data) fired on open — website / phone / HQ /
  // firmographics. Non-fatal: on failure the panel keeps its shipment-intel view.
  const [live, setLive] = useState(null);
  const [enriching, setEnriching] = useState(false);
  useEffect(() => {
    if (!row) return undefined;
    let cancelled = false;
    setLive(null);
    setEnriching(true);
    enrichCompanyLive({ name: row.company_name, domain: row.domain })
      .then((res) => { if (!cancelled) setLive(res?.enriched ? res.data : null); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setEnriching(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  if (!row) return null;

  const loc = compactLocation(row.city, row.state, row.country);
  const flag = loc.flag || countryFlag(row.country);
  const raw = row.raw || {};
  const shipments = row.shipments ?? raw.totalShipments ?? raw.shipments ?? raw.shipments_12m ?? null;
  const teu = row.teu ?? raw.latestYearTeu ?? raw.teu ?? null;
  const topLane = row.top_lane ?? row.top_origin_country ?? raw.top_route_12m ?? null;
  const oppScore = row.opportunity_composite_score != null ? Math.round(row.opportunity_composite_score) : null;
  const lastShip = row.last_shipment ?? raw.last_shipment ?? raw.most_recent_shipment_date ?? null;
  // Enriched fields (fall back to whatever the row already had).
  const website = live?.website || row.domain || row.website || raw.website || null;
  const phone = live?.phone || null;
  const addr = live?.street_address
    ? [live.street_address, live.city, live.state].filter(Boolean).join(', ')
    : null;
  const linkedin = live?.linkedin_url || null;
  const industry = row.industry || live?.industry || null;
  const revenue = row.revenue ?? live?.annual_revenue ?? null;
  const headcount = live?.estimated_num_employees ?? null;

  // Free Google Maps deep link (no API, no ToS) — user can jump to Google's listing.
  const gmapsQuery = encodeURIComponent(
    [row.company_name, row.city, row.state, row.country].filter(Boolean).join(' '),
  );
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${gmapsQuery}`;

  const stats = [
    { label: 'Shipments 12M', value: fmtCompact(shipments), icon: Ship },
    { label: 'Est. TEU 12M', value: fmtCompact(teu), icon: Ship },
    { label: 'Annual Sales', value: fmtMoney(revenue), icon: TrendingUp },
    { label: 'Opp Score', value: oppScore != null ? String(oppScore) : '—', icon: TrendingUp },
  ];

  return (
    <motion.div
      key={row.id}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
      transition={reduce ? { duration: 0.15 } : springs.sheet}
      className="absolute z-30 flex flex-col overflow-hidden border-slate-200 bg-white shadow-2xl inset-x-0 bottom-0 h-[62%] min-h-[220px] rounded-t-2xl border-t sm:inset-y-3 sm:bottom-3 sm:left-3 sm:right-auto sm:h-auto sm:w-[400px] sm:rounded-2xl sm:border"
    >
      {/* Back to results */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Results
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4">
          <CompanyAvatar name={row.company_name} domain={website} size={44} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display flex items-center gap-1.5 text-[16px] font-bold leading-tight text-slate-900">
              {flag ? <span className="text-[16px] leading-none" aria-hidden>{flag}</span> : null}
              <span className="truncate">{row.company_name}</span>
            </h2>
            <div className="font-body mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
              <MapPin size={11} className="shrink-0" /> <span className="truncate">{loc.text || '—'}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {industry ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">{industry}</span> : null}
              {row.vertical ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{row.vertical}</span> : null}
              {headcount != null ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{fmtCompact(headcount)} employees</span> : null}
              {enriching ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600"><Loader2 size={10} className="animate-spin" /> Enriching</span> : null}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap gap-2 px-4">
          <button
            type="button"
            onClick={(e) => onSave?.(row, e)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition active:scale-[0.97] hover:border-blue-400 hover:text-blue-700 motion-reduce:active:scale-100"
          >
            {row.is_saved ? <BookmarkCheck size={14} className="text-emerald-600" /> : <Bookmark size={14} />}
            {row.is_saved ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={(e) => onOpenFull?.(row, e)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12.5px] font-semibold text-white shadow-sm transition active:scale-[0.97] hover:bg-blue-700 motion-reduce:active:scale-100"
          >
            <Building2 size={14} /> Open full profile
          </button>
        </div>

        {/* Contact & location — from live Apollo enrichment (on open). */}
        {(phone || addr || website || linkedin) ? (
          <div className="mt-4 space-y-1.5 px-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact & Location</div>
            {website ? (
              <a href={`https://${String(website).replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer"
                 className="flex items-center gap-2 text-[12.5px] font-medium text-blue-600 hover:text-blue-800">
                <ExternalLink size={13} className="shrink-0" /> <span className="truncate">{String(website).replace(/^https?:\/\//, '')}</span>
              </a>
            ) : null}
            {phone ? (
              <a href={`tel:${phone}`} className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 hover:text-slate-900">
                <Phone size={13} className="shrink-0" /> {phone}
              </a>
            ) : null}
            {addr ? (
              <div className="flex items-start gap-2 text-[12.5px] text-slate-600">
                <MapPin size={13} className="mt-0.5 shrink-0" /> <span>{addr}</span>
              </div>
            ) : null}
            {linkedin ? (
              <a href={linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[12.5px] font-medium text-slate-600 hover:text-slate-900">
                <Linkedin size={13} className="shrink-0" /> LinkedIn
              </a>
            ) : null}
          </div>
        ) : enriching ? (
          <div className="mt-4 flex items-center gap-2 px-4 text-[12px] text-slate-400">
            <Sparkles size={13} className="animate-pulse text-blue-400" /> Harvey is pulling live company data…
          </div>
        ) : null}

        {/* Shipment intelligence */}
        <div className="mt-4 px-4">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment Intelligence</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">{s.label}</div>
                <div className="font-display mt-1 text-[18px] font-bold tabular-nums text-slate-900">{s.value}</div>
              </div>
            ))}
          </div>
          {topLane ? (
            <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">Top Trade Lane</div>
              <div className="font-display mt-1 truncate text-[13px] font-semibold text-slate-900">{topLane}</div>
            </div>
          ) : null}
          {lastShip ? (
            <div className="font-body mt-2 text-[11.5px] text-slate-500">Most recent activity: <span className="font-semibold text-slate-700">{lastShip}</span></div>
          ) : null}
        </div>

        {/* Links */}
        <div className="mt-4 border-t border-slate-100 px-4 py-4">
          <a href={gmapsUrl} target="_blank" rel="noreferrer"
             className="flex items-center gap-2 text-[12.5px] font-medium text-slate-600 hover:text-slate-900">
            <MapPin size={13} /> View on Google Maps
          </a>
        </div>

        <p className="font-body px-4 pb-4 text-[11px] leading-relaxed text-slate-400">
          Sourced from observed shipment records + LIT enrichment. Open the full profile for contacts,
          carriers, commodity mix, and the complete trade-lane history.
        </p>
      </div>
    </motion.div>
  );
}
