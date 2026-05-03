// Pulse Quick Card — right-rail analyze panel.
//
// Mirrors CDPDetailsPanel chrome (light, slate tokens, font-display labels)
// so it feels native next to the Company Profile. Sections:
//   - Identity        (logo, name, domain, location, status pill)
//   - Key signals     (database membership, growth YoY, e-commerce stack,
//                      hiring/sales signals, recent activity)
//   - Coach insight   (placeholder for AI-narrated growth reason)
//   - Firmographics   (industry, employees, revenue, founded)
//   - Contact         (phone, website, LinkedIn)
//   - Actions         (Open in Search · Find decision makers ·
//                      Add to list · Add to Campaign)
//   - Similar         (3 like-companies, when available)
//
// Vendor-neutral copy: nothing here mentions Apollo / ImportYeti / Tavily /
// Hunter. "Verified", "In database", "Live", "Coach" — that's it.

import { useMemo } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  GitBranch,
  Link as LinkIcon,
  Linkedin,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import BrandIcon from '@/features/pulse/BrandIcon';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import { extractDomain } from '@/lib/logo';

const RAIL_BG = 'bg-white';

export default function PulseQuickCard({
  company,
  open,
  onClose,
  onOpenInSearch,
  onAddToCampaign,
  onSaveToList,
  onFindDecisionMakers,
  onGenerateInsight,
  isInDatabase,
  // Coach insight state — populated by Pulse page after pulse-ai-enrich
  // returns. `insight` carries { report, generatedAt, cached, confidence,
  // companyId }. `insightLoading` and `insightError` handle in-flight /
  // failure states.
  insight,
  insightLoading,
  insightError,
}) {
  if (!open || !company) return null;

  const domain = extractDomain(company.domain || company.website);
  const location = [company.city, company.state, company.country].filter(Boolean).join(', ');
  const inDb = isInDatabase || company.provenance === 'database' || company.alsoLive;

  // YoY growth — if the row carries shipment kpis we can compute / show
  // the trailing-12m number, but real YoY needs prior-period data we may
  // not have. Show what we can; never fabricate.
  const shipments = company.kpis?.shipments_12m ?? null;
  const teu = company.kpis?.teu_12m ?? null;
  const recentDate = company.kpis?.most_recent_shipment_date ?? null;

  // Tech stack — populated from enrichment when available. Until then we
  // surface the row honestly with a "Detection pending" empty state.
  const techStack = Array.isArray(company.tech_stack) ? company.tech_stack : [];
  const ecomPlatform = company.ecommerce_platform || detectEcomFromStack(techStack);

  return (
    <>
      {/* mobile scrim */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close panel"
        className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
      />

      <aside
        className={[
          'fixed right-0 top-0 z-50 flex h-full w-[360px] max-w-[92vw] flex-col border-l border-slate-200 shadow-[0_-8px_36px_rgba(15,23,42,0.10)]',
          RAIL_BG,
        ].join(' ')}
      >
        {/* Header */}
        <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <CompanyAvatar
            name={company.name || 'Unknown'}
            domain={domain || null}
            size="sm"
            className="!h-9 !w-9 !rounded-md"
          />
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-[15px] font-bold leading-tight text-slate-900">
              {company.name}
            </div>
            <div className="font-body mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              {domain ? (
                <a
                  href={ensureHttp(company.website || `https://${domain}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 truncate text-blue-600 hover:underline"
                >
                  {domain}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span className="truncate">No domain</span>
              )}
              {location ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-0.5 truncate">
                    <MapPin className="h-2.5 w-2.5" />
                    {location}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Provenance strip */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-[#FAFBFC] px-4 py-2">
          {inDb ? (
            <Badge tone="blue" icon={Database}>
              In your database
            </Badge>
          ) : null}
          {company.alsoLive ? (
            <Badge tone="green" icon={CheckCircle2}>
              Verified
            </Badge>
          ) : company.provenance === 'live' ? (
            <Badge tone="amber" icon={Sparkles}>
              Live
            </Badge>
          ) : !inDb ? (
            <Badge tone="slate" icon={Sparkles}>
              Discovered
            </Badge>
          ) : null}
        </div>

        {/* Body — scroll */}
        <div className="flex-1 overflow-y-auto">
          {/* Key signals */}
          <Section label="Key signals">
            <SignalRow
              icon={BarChart3}
              label="Trailing 12m shipments"
              value={shipments != null ? Number(shipments).toLocaleString() : '—'}
              accent={shipments != null ? 'blue' : 'mute'}
            />
            <SignalRow
              icon={TrendingUp}
              label="Year-over-year growth"
              value={null}
              hint="Coach can analyze the change for you"
              accent="mute"
            />
            <SignalRow
              icon={ShoppingBag}
              label="E-commerce platform"
              value={ecomPlatform || null}
              brand={ecomPlatform}
              hint="Detection pending"
              accent={ecomPlatform ? 'blue' : 'mute'}
            />
            <SignalRow
              icon={Zap}
              label="Hiring / sales signal"
              value={null}
              hint="Detection pending"
              accent="mute"
            />
            <SignalRow
              icon={Briefcase}
              label="Recent activity"
              value={recentDate ? formatRelative(recentDate) : null}
              accent={recentDate ? 'blue' : 'mute'}
            />
          </Section>

          {/* Tech stack — visual brand row */}
          <Section label="Tech stack">
            {techStack.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 py-1">
                {techStack.slice(0, 8).map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  >
                    <BrandIcon name={tech} size={13} />
                    <span className="font-body text-[11px] font-medium text-slate-700">
                      {tech}
                    </span>
                  </span>
                ))}
                {techStack.length > 8 ? (
                  <span className="font-mono inline-flex items-center rounded-md bg-slate-100 px-1.5 py-1 text-[10.5px] font-semibold text-slate-500">
                    +{techStack.length - 8}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-1.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50">
                  <Cpu className="h-3 w-3 text-slate-400" />
                </div>
                <div className="font-body text-[11px] italic text-slate-400">
                  Detection pending — Coach will surface platforms, CRM, and analytics tools.
                </div>
              </div>
            )}
          </Section>

          {/* Coach insight — dark slate + cyan to match Pulse Coach branding */}
          <Section label="Coach insight" tone="dark">
            <CoachInsightPanel
              insight={insight}
              loading={insightLoading}
              error={insightError}
              onGenerate={() => onGenerateInsight?.(company)}
              onRefresh={() => onGenerateInsight?.(company, { force: true })}
              companyName={company.name}
            />
          </Section>

          {/* Firmographics */}
          <Section label="Firmographics">
            <Row label="Industry" value={company.industry || '—'} />
            <Row label="Employees" value={company.employee_count || '—'} />
            <Row label="Revenue band" value={company.annual_revenue || '—'} />
            <Row label="HQ" value={location || '—'} />
          </Section>

          {/* Contact */}
          <Section label="Contact">
            <Row
              icon={Phone}
              label="Phone"
              value={company.phone || '—'}
              mono={!!company.phone}
            />
            <Row
              icon={LinkIcon}
              label="Website"
              value={
                company.website ? (
                  <a
                    href={ensureHttp(company.website)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    {stripHttp(company.website)}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <Row
              icon={Linkedin}
              label="LinkedIn"
              value={
                company.linkedin_url ? (
                  <a
                    href={company.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    Open profile
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  '—'
                )
              }
            />
          </Section>
        </div>

        {/* Action stack — sticky footer */}
        <footer className="border-t border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            {inDb ? (
              <ActionButton
                primary
                icon={Search}
                label="Open in Search"
                onClick={() => onOpenInSearch?.(company)}
              />
            ) : (
              <ActionButton
                icon={Search}
                label="Check in Search"
                onClick={() => onOpenInSearch?.(company)}
              />
            )}
            <ActionButton
              icon={UserPlus}
              label="Find decision makers"
              onClick={() => onFindDecisionMakers?.(company)}
            />
            <ActionButton
              icon={Database}
              label="Add to list"
              onClick={() => onSaveToList?.(company)}
            />
            <ActionButton
              icon={Target}
              label="Add to Campaign"
              onClick={() => onAddToCampaign?.(company)}
            />
          </div>
        </footer>
      </aside>
    </>
  );
}

/* ─── Primitives ─── */

function Section({ label, tone, children }) {
  const headerStyle =
    tone === 'dark'
      ? 'bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-[#7DD3FC]'
      : 'bg-[#FAFBFC] text-slate-500';
  return (
    <div className="border-b border-slate-100">
      <div className={['px-4 py-2', headerStyle].join(' ')}>
        <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-px px-4 py-2.5">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value, mono }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-baseline gap-2 py-1">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        {Icon ? <Icon className="h-3 w-3 text-slate-400" /> : null}
        <span className="font-body">{label}</span>
      </div>
      <div
        className={[
          mono ? 'font-mono' : 'font-body',
          'min-w-0 truncate text-[12px] text-slate-900',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  );
}

function SignalRow({ icon: Icon, label, value, hint, accent, brand }) {
  const valueColor =
    accent === 'blue' ? 'text-blue-700' :
    accent === 'mute' ? 'text-slate-400' :
    'text-slate-900';
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50">
        <Icon className="h-3 w-3 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-body text-[11px] text-slate-500">{label}</div>
        {value != null ? (
          <div className={['flex items-center gap-1.5 text-[12.5px] font-semibold', valueColor, brand ? 'font-display' : 'font-mono'].join(' ')}>
            {brand ? <BrandIcon name={brand} size={12} /> : null}
            <span>{value}</span>
          </div>
        ) : (
          <div className="font-body text-[11px] italic text-slate-400">{hint || '—'}</div>
        )}
      </div>
    </div>
  );
}

// Best-effort guess of the e-commerce platform from a tech stack list.
// If the backend later returns an explicit ecommerce_platform field this
// helper is bypassed.
function detectEcomFromStack(stack) {
  if (!Array.isArray(stack) || !stack.length) return null;
  const lc = stack.map((s) => String(s).toLowerCase());
  if (lc.some((s) => s.includes('shopify'))) return 'Shopify';
  if (lc.some((s) => s.includes('woocommerce') || s.includes('woo'))) return 'WooCommerce';
  if (lc.some((s) => s.includes('bigcommerce'))) return 'BigCommerce';
  if (lc.some((s) => s.includes('magento') || s.includes('adobe commerce'))) return 'Magento';
  if (lc.some((s) => s.includes('squarespace'))) return 'Squarespace';
  return null;
}

function Badge({ tone, icon: Icon, children }) {
  const map = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span
      className={[
        'font-display inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold',
        map[tone] || map.slate,
      ].join(' ')}
    >
      {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
      {children}
    </span>
  );
}

function ActionButton({ icon: Icon, label, primary, onClick }) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="font-display col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-blue-500 hover:to-blue-700"
      >
        <Icon className="h-3 w-3" />
        {label}
        <ArrowUpRight className="h-3 w-3 opacity-80" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

// Coach insight panel — three states:
//   1. idle  → invitation + Generate CTA
//   2. loading → cyan spinner with "Analyzing"
//   3. ready → structured brief (summary, why-now, buying signals,
//              similar companies) with refresh + full-brief link
//   4. error → friendly error tile with retry. LIMIT_EXCEEDED gets
//              an upgrade nudge.
function CoachInsightPanel({ insight, loading, error, onGenerate, onRefresh, companyName }) {
  const panelStyle = {
    background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #102240 100%)',
    borderColor: 'rgba(255,255,255,0.08)',
    boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
  };
  const haloStyle = {
    background: 'radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)',
  };

  // Error state takes priority
  if (error) {
    const isLimit = error.code === 'LIMIT_EXCEEDED';
    return (
      <div className="relative overflow-hidden rounded-[10px] border p-3" style={panelStyle}>
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full" style={haloStyle} />
        <div className="relative flex items-start gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
            style={{ background: 'rgba(251,146,60,0.15)', borderColor: 'rgba(251,146,60,0.4)' }}
          >
            <AlertCircle className="h-3 w-3" style={{ color: '#FB923C' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#FB923C' }}>
              {isLimit ? 'Limit reached' : 'Coach insight failed'}
            </div>
            <div className="font-body text-[12px] leading-relaxed text-slate-300">{error.message}</div>
            <div className="mt-2.5 flex gap-1.5">
              {isLimit ? (
                <a
                  href="/app/billing"
                  className="font-display inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition"
                  style={{
                    background: 'rgba(0,240,255,0.10)',
                    borderColor: 'rgba(0,240,255,0.35)',
                    color: '#7DD3FC',
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  Upgrade plan
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onGenerate}
                  className="font-display inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition"
                  style={{
                    background: 'rgba(0,240,255,0.10)',
                    borderColor: 'rgba(0,240,255,0.35)',
                    color: '#7DD3FC',
                  }}
                >
                  <RefreshCw className="h-3 w-3" />
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[10px] border p-3" style={panelStyle}>
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full" style={haloStyle} />
        <div className="relative flex items-start gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
            style={{ background: 'rgba(0,240,255,0.12)', borderColor: 'rgba(0,240,255,0.35)' }}
          >
            <span
              className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px]"
              style={{ borderColor: 'rgba(0,240,255,0.2)', borderTopColor: '#00F0FF' }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#00F0FF' }}>
              Pulse Coach
            </div>
            <div className="font-body text-[12px] leading-relaxed text-slate-300">
              Analyzing growth, web signals, and buying triggers for {companyName}…
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ready state — render the structured brief
  if (insight?.report) {
    const r = insight.report;
    const summary = pickText(r.company_summary);
    const whyNow = pickText(r.why_now);
    const buyingSignals = (Array.isArray(r.buying_signals) ? r.buying_signals : [])
      .map(pickText)
      .filter(Boolean)
      .slice(0, 4);
    const similar = (Array.isArray(r.similar_companies) ? r.similar_companies : [])
      .filter((s) => s?.name)
      .slice(0, 3);

    return (
      <div className="relative overflow-hidden rounded-[10px] border p-3" style={panelStyle}>
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full" style={haloStyle} />
        <div className="relative">
          {/* Header row */}
          <div className="mb-2 flex items-center gap-2">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
              style={{ background: 'rgba(0,240,255,0.12)', borderColor: 'rgba(0,240,255,0.35)' }}
            >
              <Sparkles className="h-3 w-3" style={{ color: '#00F0FF' }} />
            </div>
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#00F0FF' }}>
              Pulse Coach
            </div>
            {insight.cached ? (
              <span className="font-mono text-[9.5px] text-slate-500">
                · cached
              </span>
            ) : null}
            {insight.confidence != null ? (
              <span className="font-mono ml-auto text-[10px] text-slate-400">
                {Math.round(insight.confidence)}% conf.
              </span>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Regenerate insight"
              className="ml-1 flex h-5 w-5 items-center justify-center rounded-md text-slate-500 hover:bg-white/5 hover:text-slate-300"
            >
              <RefreshCw className="h-2.5 w-2.5" />
            </button>
          </div>

          {/* Summary — the lead paragraph */}
          {summary ? (
            <div className="font-body mb-2.5 text-[12px] leading-relaxed text-slate-200">
              {summary}
            </div>
          ) : null}

          {/* Why-now — the growth narrative */}
          {whyNow ? (
            <div className="mb-2.5 rounded-md border border-white/5 bg-white/[0.02] p-2.5">
              <div className="font-display mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <TrendingUp className="h-2.5 w-2.5" />
                Why now
              </div>
              <div className="font-body text-[11.5px] leading-relaxed text-slate-300">{whyNow}</div>
            </div>
          ) : null}

          {/* Buying signals — pills */}
          {buyingSignals.length > 0 ? (
            <div className="mb-2.5">
              <div className="font-display mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <Zap className="h-2.5 w-2.5" />
                Buying signals
              </div>
              <div className="flex flex-wrap gap-1">
                {buyingSignals.map((s, i) => (
                  <span
                    key={i}
                    className="font-body inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-slate-300"
                    title={s}
                  >
                    {truncate(s, 60)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Similar companies — clickable chips that route to Search */}
          {similar.length > 0 ? (
            <div className="mb-2">
              <div className="font-display mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <GitBranch className="h-2.5 w-2.5" />
                Similar companies
              </div>
              <div className="flex flex-wrap gap-1">
                {similar.map((s, i) => (
                  <a
                    key={i}
                    href={s.search_url || `/app/search?q=${encodeURIComponent(s.name)}`}
                    title={s.reason || s.name}
                    className="font-body inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] transition"
                    style={{
                      background: 'rgba(0,240,255,0.06)',
                      borderColor: 'rgba(0,240,255,0.25)',
                      color: '#7DD3FC',
                    }}
                  >
                    {s.name}
                    <ExternalLink className="h-2 w-2" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Footer — full brief link */}
          {insight.companyId ? (
            <a
              href={`/app/companies/${insight.companyId}?tab=research`}
              className="font-display inline-flex items-center gap-1 text-[10.5px] font-semibold"
              style={{ color: '#7DD3FC' }}
            >
              Open full brief
              <ArrowUpRight className="h-2.5 w-2.5" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  // Idle state — invite + Generate CTA
  return (
    <div className="relative overflow-hidden rounded-[10px] border p-3" style={panelStyle}>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full" style={haloStyle} />
      <div className="relative flex items-start gap-2">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
          style={{ background: 'rgba(0,240,255,0.12)', borderColor: 'rgba(0,240,255,0.35)' }}
        >
          <Sparkles className="h-3 w-3" style={{ color: '#00F0FF' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#00F0FF' }}>
            Pulse Coach
          </div>
          <div className="font-body text-[12px] leading-relaxed text-slate-300">
            Generate an insight to see why this company is growing, recent product launches, and
            what to talk about on first contact.
          </div>
          <button
            type="button"
            onClick={onGenerate}
            className="font-display mt-2.5 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition"
            style={{
              background: 'rgba(0,240,255,0.10)',
              borderColor: 'rgba(0,240,255,0.35)',
              color: '#7DD3FC',
            }}
          >
            <Sparkles className="h-3 w-3" />
            Generate insight
          </button>
        </div>
      </div>
    </div>
  );
}

function pickText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (value.summary) return String(value.summary).trim();
    if (value.body) return String(value.body).trim();
    if (value.headline) return String(value.headline).trim();
  }
  return '';
}

function truncate(s, max) {
  const str = String(s || '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function ensureHttp(u) {
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
function stripHttp(u) {
  return String(u || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
function formatRelative(d) {
  try {
    const date = new Date(d);
    const ms = Date.now() - date.getTime();
    const days = Math.floor(ms / 86400000);
    if (days < 1) return 'today';
    if (days < 7) return `${days}d ago`;
    if (days < 60) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } catch {
    return '—';
  }
}
