import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Building2, Network, Users2 } from 'lucide-react';
import { springs } from '@/lib/motion';
import CountryFlag from '@/components/explorer/CountryFlag';
import {
  mxFmtUsd,
  mxSearchHref,
  normalizeMxCompanyName,
  shortGatewayLabel,
  useMxCompanyProfile,
} from '@/api/mxProfile';

/**
 * MxPartnersPanel — the MX relationship view, rendered as the Trade Graph
 * tab body for MX identities (CompanyProfileV2). Extracted from
 * MxTradePanel's dissolved inner "Partners" + broker card, restyled to
 * CDPTradeGraph's card language (rounded-2xl translucent GraphCard shells,
 * stat-chip strip, brand-blue rank bars) so the tab feels identical to the
 * US Trade Graph. Same cached lit_mx_company_profile query — no extra RPC.
 */

/** Section shell — verbatim CDPTradeGraph GraphCard material. */
function GraphCard({ icon, tone, title, count, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <h3 className="font-display text-[13.5px] font-bold tracking-tight text-slate-900">{title}</h3>
        {count != null ? (
          <span className="font-mono ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
            {count}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function StatChip({ icon, tone, label }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${tone}`}>
      {icon} {label}
    </span>
  );
}

export default function MxPartnersPanel({ companyName }) {
  const reduce = useReducedMotion();
  const name = useMemo(() => normalizeMxCompanyName(companyName), [companyName]);
  const { data, isLoading } = useMxCompanyProfile(name);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-16 text-center">
        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
        <p className="font-body text-[12px] text-slate-500">Mapping trade relationships…</p>
      </div>
    );
  }

  const partners = data?.counterparties || [];
  const brokers = data?.brokers || [];
  if (!partners.length && !brokers.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100">
          <Network size={17} className="text-slate-400" />
        </div>
        <p className="font-display text-[13px] font-semibold text-slate-800">No trade relationships yet</p>
        <p className="font-body max-w-[300px] text-[11.5px] leading-snug text-slate-500">
          No counterparties or customs brokers cached for {name || 'this company'} —
          open it from the MX search first to pull its declarations.
        </p>
      </div>
    );
  }

  const maxN = Math.max(1, ...partners.map((c) => Number(c?.n) || 0));
  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.div {...enter} transition={springs.default} className="space-y-3.5">
      {/* Stat strip — same chip language as CDPTradeGraph */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatChip
          icon={<Users2 size={11} />}
          tone="text-blue-700 bg-blue-50 ring-blue-200"
          label={`${partners.length} partner${partners.length === 1 ? '' : 's'}`}
        />
        {brokers.length > 0 ? (
          <StatChip
            icon={<Building2 size={11} />}
            tone="text-rose-700 bg-rose-50 ring-rose-200"
            label={`${brokers.length} customs broker${brokers.length === 1 ? '' : 's'}`}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Trading partners */}
        {partners.length > 0 ? (
          <GraphCard icon={<Users2 size={14} />} tone="bg-blue-50 text-blue-600" title="Trading partners" count={partners.length}>
            <p className="font-body -mt-1 mb-1 text-[11px] text-slate-400">
              Counterparties on cached declarations — click to find them in Search.
            </p>
            <ul className="divide-y divide-slate-100">
              {partners.map((c, i) => {
                const n = Number(c?.n) || 0;
                const loc = c?.c && c.c !== 'MX' ? null : shortGatewayLabel(c?.state);
                return (
                  <li key={i} className="py-2">
                    <Link
                      to={mxSearchHref(c.v)}
                      title={`Search ${c.v} in LIT`}
                      className="group block active:scale-[0.99] motion-reduce:active:scale-100"
                    >
                      <div className="flex items-center gap-2">
                        <CountryFlag code={c.c || (loc ? 'MX' : null)} size={12} />
                        <span className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900 group-hover:text-blue-700">
                          {c.v}
                        </span>
                        {mxFmtUsd(c.usd) ? (
                          <span className="font-body shrink-0 text-[10.5px] text-slate-400">{mxFmtUsd(c.usd)}</span>
                        ) : null}
                        <span className="font-mono shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">
                          {n.toLocaleString()}
                        </span>
                        <ArrowUpRight size={11} className="shrink-0 text-slate-300 transition group-hover:text-blue-600" />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.max(4, (n / maxN) * 100)}%` }}
                          />
                        </div>
                        {loc ? (
                          <span className="shrink-0 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                            {loc}, MX
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </GraphCard>
        ) : null}

        {/* Customs brokers */}
        {brokers.length > 0 ? (
          <GraphCard icon={<Building2 size={14} />} tone="bg-rose-50 text-rose-600" title="Customs brokers" count={brokers.length}>
            <p className="font-body -mt-1 mb-1 text-[11px] text-slate-400">
              Agentes aduanales filing for this company.
            </p>
            <ul className="divide-y divide-slate-100">
              {brokers.map((b, i) => (
                <li key={i} className="flex items-center gap-2 py-2">
                  <Link
                    to={mxSearchHref(b.v)}
                    title={`Search ${b.v} in LIT`}
                    className="font-display min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-900 transition-colors hover:text-blue-700 hover:underline active:scale-[0.99] motion-reduce:active:scale-100"
                  >
                    {b.v}
                  </Link>
                  <span className="font-mono shrink-0 text-[11px] tabular-nums text-slate-500">{b.n}</span>
                </li>
              ))}
            </ul>
          </GraphCard>
        ) : null}
      </div>

      <p className="font-body text-[10.5px] leading-snug text-slate-400">
        Built from {name || 'this company'}&apos;s Mexican customs declarations (pedimentos) cached by LIT.
      </p>
    </motion.div>
  );
}
