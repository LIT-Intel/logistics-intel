import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDownToLine, ArrowUpFromLine, FileText } from 'lucide-react';
import { springs } from '@/lib/motion';
import LitSectionCard from '@/components/ui/LitSectionCard';
import {
  MX_MODE_ICONS,
  MX_MODE_TONES,
  mxFmtUsd,
  mxModeKey,
  mxSearchHref,
  normalizeMxCompanyName,
  useMxCompanyProfile,
} from '@/api/mxProfile';

/**
 * MxDeclarationsTable — the MX pedimento line-item table, rendered as the
 * Pulse LIVE tab body for MX identities (CompanyProfileV2). Extracted from
 * MxTradePanel's dissolved inner "Declarations" tab; reads the SAME cached
 * lit_mx_company_profile query as the header/panel (zero extra RPCs).
 * v3 columns (custom_regime, pedimento_number) render defensively — older
 * cached payloads simply show "—".
 */

function cardTitle(icon, tone, text) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span>
      {text}
    </span>
  );
}

export default function MxDeclarationsTable({ companyName }) {
  const reduce = useReducedMotion();
  const name = useMemo(() => normalizeMxCompanyName(companyName), [companyName]);
  const { data, isLoading } = useMxCompanyProfile(name);
  const rows = data?.declarations || [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
        <p className="font-body text-[12px] text-slate-500">Loading customs declarations…</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="font-body py-10 text-center text-[12.5px] text-slate-500">
        No declaration lines cached for this company.
      </p>
    );
  }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={springs.default}
      className="space-y-3.5"
    >
      <LitSectionCard
        title={cardTitle(<FileText size={13} />, 'bg-slate-100 text-slate-600', 'Recent declarations')}
        sub="Latest cached pedimento lines"
        action={
          <span className="font-mono rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
            {rows.length}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <th className="py-1.5 pr-3">Date</th>
                <th className="py-1.5 pr-3">Dir</th>
                <th className="py-1.5 pr-3">Mode</th>
                <th className="py-1.5 pr-3">Gateway</th>
                <th className="py-1.5 pr-3">Counterparty</th>
                <th className="py-1.5 pr-3">Product</th>
                <th className="py-1.5 pr-3">Incoterm</th>
                <th className="py-1.5 pr-3">Regime</th>
                <th className="py-1.5 pr-3">Pedimento</th>
                <th className="py-1.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d, i) => {
                const mode = mxModeKey(d.transport_type);
                const Icon = MX_MODE_ICONS[mode];
                const tone = MX_MODE_TONES[mode];
                return (
                  <tr key={i} className="text-slate-700">
                    <td className="font-mono whitespace-nowrap py-2 pr-3 text-[11px]">{d.d || '—'}</td>
                    <td className="py-2 pr-3">
                      {d.direction === 'import'
                        ? <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownToLine size={11} /> In</span>
                        : <span className="inline-flex items-center gap-1 text-cyan-700"><ArrowUpFromLine size={11} /> Out</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ring-1 ${tone}`} title={d.transport_type || 'Unknown'}>
                        <Icon size={13} />
                      </span>
                    </td>
                    <td className="max-w-[140px] truncate py-2 pr-3">{d.customs_office || '—'}</td>
                    <td className="max-w-[160px] truncate py-2 pr-3 font-medium text-slate-800">
                      {d.counterparty ? (
                        <Link
                          to={mxSearchHref(d.counterparty)}
                          title={`Search ${d.counterparty} in LIT`}
                          className="transition-colors hover:text-blue-700 hover:underline"
                        >
                          {d.counterparty}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-3">{d.product || '—'}</td>
                    <td className="font-mono whitespace-nowrap py-2 pr-3 text-[11px]">{d.incoterm || '—'}</td>
                    <td className="max-w-[120px] truncate py-2 pr-3" title={d.custom_regime || undefined}>
                      {d.custom_regime || '—'}
                    </td>
                    <td className="font-mono whitespace-nowrap py-2 pr-3 text-[11px]">{d.pedimento_number || '—'}</td>
                    <td className="font-mono whitespace-nowrap py-2 text-right text-[11px]">{mxFmtUsd(d.value_usd) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </LitSectionCard>
      <p className="font-body text-[10.5px] text-slate-400">
        Sourced from Mexican customs declarations (pedimentos) cached by LIT — viewing this profile costs no data credits.
      </p>
    </motion.div>
  );
}
