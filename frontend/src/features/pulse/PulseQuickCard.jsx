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

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  GitBranch,
  Link as LinkIcon,
  Linkedin,
  Loader2,
  Mail,
  MailCheck,
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
import { supabase } from '@/lib/supabase';

// Stable cache key for a discovered contact. Mirrors the {key} used by
// the per-row render below so toggleReveal can find the row in
// decisionMakers state when the user clicks Reveal.
function contactKey(c) {
  return c.source_contact_key || `${c.full_name}-${c.title}`;
}
import {
  computeVolumeSignal,
  fetchDecisionMakers,
  fetchHiringSignal,
  summarizeHiring,
} from '@/features/pulse/pulseSignals';

const RAIL_BG = 'bg-white';

export default function PulseQuickCard({
  company,
  open,
  onClose,
  onOpenInSearch,
  onAddToCampaign,
  onSaveToLibrary,        // NEW: save to All-saves without opening list picker
  onSaveToList,           // existing: save + open named-list picker
  onAddContactToCampaign, // optional: add a discovered Apollo contact to campaign
  onAddContactToList,     // optional: add a discovered Apollo contact to a saved list
  onGenerateInsight,
  isInDatabase,
  saveToLibraryPending,
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

  // Volume signal — derived from shipments_12m + most_recent_shipment_date.
  // Honest computation; not fabricated YoY growth.
  const volumeSignal = useMemo(() => computeVolumeSignal(company.kpis), [company.kpis]);

  // Hiring signal — lazy-fetched per-company on rail open. Cache on the
  // helper side keeps repeat opens free.
  const orgId = company.business_id || company.source_company_key || null;
  const [hiring, setHiring] = useState(null);
  const [hiringLoading, setHiringLoading] = useState(false);
  const [hiringError, setHiringError] = useState(null);

  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    setHiringLoading(true);
    setHiringError(null);
    setHiring(null);
    fetchHiringSignal(orgId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setHiring(res.signal);
      } else {
        setHiringError(res.code || 'UNAVAILABLE');
      }
      setHiringLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, orgId]);

  // Decision makers — lazy on user click, cached client-side for 6h
  const [decisionMakers, setDecisionMakers] = useState(null);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState(null);
  const [revealedContactKeys, setRevealedContactKeys] = useState(new Set());

  // Reset DM state on company change
  useEffect(() => {
    setDecisionMakers(null);
    setDmLoading(false);
    setDmError(null);
    setRevealedContactKeys(new Set());
  }, [company.id]);

  async function handleFindDecisionMakers() {
    if (dmLoading) return;
    setDmLoading(true);
    setDmError(null);
    const res = await fetchDecisionMakers({
      domain,
      name: company.name,
      city: company.city,
      state: company.state,
      country: company.country,
    });
    setDmLoading(false);
    if (!res.ok) {
      setDmError(res.message || 'Could not load decision makers.');
      setDecisionMakers([]);
      return;
    }
    setDecisionMakers(res.contacts);
  }

  // Per-contact in-flight tracking for the Reveal-as-Enrich flow below.
  const [enrichingKeys, setEnrichingKeys] = useState(new Set());

  /**
   * Reveal-as-Enrich. The Apollo people-SEARCH endpoint returns locked
   * email markers (email_not_unlocked@…) which apollo-contact-search
   * normalizes to null — so the contact card showed "No email on file"
   * forever and the standalone Enrich button was easy to miss. This
   * function now does both jobs:
   *   1. Toggle the reveal state (so a second click hides the row).
   *   2. If the contact's email is null, fire apollo-contact-enrich
   *      (people/match endpoint with reveal_personal_emails=true) to
   *      actually unlock + persist the email. Result merges back into
   *      decisionMakers state so the row updates in place.
   */
  async function toggleReveal(key) {
    const wasRevealed = revealedContactKeys.has(key);
    setRevealedContactKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (wasRevealed) return; // collapsing — no API call

    const contact = (decisionMakers || []).find((c) => contactKey(c) === key);
    if (!contact) return;
    if (contact.email) return; // already unlocked

    if (enrichingKeys.has(key)) return;
    setEnrichingKeys((prev) => new Set(prev).add(key));
    try {
      const resolvedDomain =
        company?.domain ||
        company?.website ||
        contact.organization_domain ||
        null;
      const resolvedCompanyName =
        company?.name ||
        company?.company_name ||
        contact.organization_name ||
        null;
      const resolvedCompanyId =
        company?.company_id ||
        company?.id ||
        company?.uuid ||
        null;
      const target = {
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        full_name: contact.full_name || contact.name || null,
        name: contact.full_name || contact.name || null,
        title: contact.title || null,
        email: contact.email || null,
        linkedin_url: contact.linkedin_url || null,
        domain: resolvedDomain,
        organization_name: resolvedCompanyName,
        apollo_person_id:
          contact.apollo_person_id ||
          contact.apollo_id ||
          contact.id ||
          null,
      };
      const { data, error } = await supabase.functions.invoke(
        'apollo-contact-enrich',
        {
          body: {
            contacts: [target],
            ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
            ...(resolvedDomain ? { domain: resolvedDomain } : {}),
            ...(resolvedCompanyName ? { company_name: resolvedCompanyName } : {}),
            reveal_personal_emails: true,
            reveal_phone_number: true,
          },
        },
      );
      if (error) throw error;
      if (data && data.ok === false) {
        const code = data.code || 'ENRICH_FAILED';
        // Surface specific Apollo error codes the user can act on.
        const friendly =
          code === 'APOLLO_NOT_CONFIGURED'
            ? 'Apollo enrichment is not configured. Ask your admin to set APOLLO_API_KEY in Supabase secrets.'
            : code === 'LIMIT_EXCEEDED'
              ? 'Plan limit reached for contact enrichment. Upgrade at /app/billing.'
              : data.message || data.error || 'Enrichment failed.';
        setDmError(friendly);
        return;
      }
      const enriched =
        data?.contacts?.[0] ||
        data?.contact ||
        data?.results?.[0] ||
        null;
      if (enriched) {
        setDecisionMakers((prev) =>
          (prev || []).map((c) =>
            contactKey(c) === key
              ? {
                  ...c,
                  email: enriched.email || c.email,
                  email_status: enriched.email_status || c.email_status,
                  phone: enriched.phone || c.phone,
                  linkedin_url: enriched.linkedin_url || c.linkedin_url,
                }
              : c,
          ),
        );
      }
    } catch (err) {
      console.error('[Pulse] reveal/enrich failed:', err);
      setDmError(err?.message || 'Could not enrich contact.');
    } finally {
      setEnrichingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

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
              label="Volume tier"
              value={volumeSignal ? volumeSignal.label : null}
              hint="No shipment history yet"
              accent={volumeSignal?.accent || 'mute'}
            />
            <SignalRow
              icon={ShoppingBag}
              label="E-commerce platform"
              value={ecomPlatform || null}
              brand={ecomPlatform}
              hint="Detection pending"
              accent={ecomPlatform ? 'blue' : 'mute'}
            />
            <HiringSignalRow
              loading={hiringLoading}
              error={hiringError}
              signal={hiring}
              orgId={orgId}
            />
            <SignalRow
              icon={Briefcase}
              label="Recent activity"
              value={
                recentDate
                  ? `${formatRelative(recentDate)}${volumeSignal?.activity ? ` · ${volumeSignal.activity}` : ''}`
                  : null
              }
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

          {/* Decision makers — Apollo contact search inline */}
          <Section label="Decision makers">
            <DecisionMakersPanel
              contacts={decisionMakers}
              loading={dmLoading}
              error={dmError}
              onFetch={handleFindDecisionMakers}
              revealedKeys={revealedContactKeys}
              onToggleReveal={toggleReveal}
              onAddContactToCampaign={onAddContactToCampaign}
              onAddContactToList={onAddContactToList}
              enrichingKeys={enrichingKeys}
            />
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
          {/* Primary CTA — full width, contextual label */}
          {inDb ? (
            <ActionButton
              primary
              icon={Search}
              label="Open in Search"
              onClick={() => onOpenInSearch?.(company)}
            />
          ) : (
            <ActionButton
              primary
              icon={Search}
              label="Check in Search"
              onClick={() => onOpenInSearch?.(company)}
            />
          )}
          {/* Secondary actions — Save / Add to list / Add to Campaign */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ActionButton
              icon={Bookmark}
              label="Save"
              busy={saveToLibraryPending}
              onClick={() => onSaveToLibrary?.(company)}
              title="Save to your Pulse library (All saves)"
            />
            <ActionButton
              icon={Database}
              label="Add to list"
              onClick={() => onSaveToList?.(company)}
              title="Save and add to a named list"
            />
            <ActionButton
              icon={Target}
              label="Campaign"
              onClick={() => onAddToCampaign?.(company)}
              title="Save and attach to a campaign"
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

// Hiring signal row — its own component because it has 4 states
// (loading, error, empty, populated) and each renders differently.
// Vendor-neutral copy: never references Apollo; says "hiring data
// unavailable" or "no open roles".
function HiringSignalRow({ loading, error, signal, orgId }) {
  // No org id at all — show the row as detection-pending so the slot
  // doesn't disappear (keeps the layout stable across companies)
  if (!orgId) {
    return (
      <SignalRow
        icon={Zap}
        label="Hiring signal"
        value={null}
        hint="Detection pending"
        accent="mute"
      />
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50">
          <Zap className="h-3 w-3 text-slate-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-body text-[11px] text-slate-500">Hiring signal</div>
          <div className="font-body text-[11px] italic text-slate-400">Checking…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <SignalRow
        icon={Zap}
        label="Hiring signal"
        value={null}
        hint="Hiring data unavailable"
        accent="mute"
      />
    );
  }
  if (!signal || !signal.total) {
    return (
      <SignalRow
        icon={Zap}
        label="Hiring signal"
        value="No open roles"
        hint=""
        accent="mute"
      />
    );
  }
  const summary = summarizeHiring(signal);
  const accent =
    signal.freshness === 'hot' ? 'green' :
    signal.freshness === 'warm' ? 'blue' :
    'slate';
  const valueColor =
    accent === 'green' ? 'text-green-700' :
    accent === 'blue' ? 'text-blue-700' :
    'text-slate-900';
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50">
        <Zap className="h-3 w-3 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-body text-[11px] text-slate-500">Hiring signal</div>
        <div className={['font-mono text-[12.5px] font-semibold', valueColor].join(' ')}>
          {summary}
        </div>
        {signal.departments?.length > 1 ? (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {signal.departments.slice(1, 4).map((d) => (
              <span
                key={d.name}
                className="font-display inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-600"
              >
                {d.name} · {d.count}
              </span>
            ))}
          </div>
        ) : null}
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

function ActionButton({ icon: Icon, label, primary, onClick, busy, title }) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        disabled={busy}
        className="font-display flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:from-blue-500 hover:to-blue-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
        {label}
        <ArrowUpRight className="h-3 w-3 opacity-80" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={busy}
      className="font-display inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

// Decision Makers panel — Apollo contact search rendered inline in
// the rail. Empty state: a clear CTA explaining what'll happen.
// Loading: spinner + "Asking Apollo for decision makers at {company}".
// Populated: stacked contact cards with reveal-on-click for email +
// phone (so the user knows when they're consuming a credit), plus
// LinkedIn link and per-contact "Add to Campaign".
function DecisionMakersPanel({
  contacts,
  loading,
  error,
  onFetch,
  revealedKeys,
  onToggleReveal,
  onAddContactToCampaign,
  onAddContactToList,
  enrichingKeys,
}) {
  // Idle — never fetched yet
  if (contacts == null && !loading && !error) {
    return (
      <div className="flex items-start gap-2.5 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50">
          <UserPlus className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-body text-[11.5px] leading-relaxed text-slate-600">
            Pull verified buyers and decision-makers at this company —
            VPs, Directors, and C-suite — with email + phone reveal.
          </div>
          <button
            type="button"
            onClick={onFetch}
            className="font-display mt-2 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            <UserPlus className="h-3 w-3" />
            Find decision makers
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        <span className="font-body text-[11.5px] text-slate-600">
          Looking up decision makers…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 py-2">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="font-body text-[11.5px] text-amber-800">{error}</div>
          <button
            type="button"
            onClick={onFetch}
            className="font-display mt-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!contacts.length) {
    return (
      <div className="py-2 text-center">
        <div className="font-body text-[11.5px] text-slate-500">
          No decision-makers indexed for this company yet.
        </div>
        <button
          type="button"
          onClick={onFetch}
          className="font-display mt-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Re-check
        </button>
      </div>
    );
  }

  // Sort: c-suite/founder/owner first, then VP, then Director — all
  // already filtered by the edge fn but the response order is
  // Apollo-internal so a quick re-sort makes the rail predictable.
  const seniorityWeight = (s) => {
    const v = String(s || '').toLowerCase();
    if (v.includes('c_suite') || v.includes('founder') || v.includes('owner')) return 0;
    if (v.includes('vp')) return 1;
    if (v.includes('head')) return 2;
    if (v.includes('director')) return 3;
    return 4;
  };
  const sorted = [...contacts].sort(
    (a, b) => seniorityWeight(a.seniority) - seniorityWeight(b.seniority),
  );
  const visible = sorted.slice(0, 8);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center justify-between text-[10.5px] text-slate-500">
        <span className="font-body">{contacts.length} decision-maker{contacts.length === 1 ? '' : 's'} found</span>
        <button
          type="button"
          onClick={onFetch}
          className="font-display inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Re-fetch
        </button>
      </div>
      {visible.map((c) => {
        const key = c.source_contact_key || `${c.full_name}-${c.title}`;
        const revealed = revealedKeys.has(key);
        const initials = (c.full_name || '?')
          .split(/\s+/).filter(Boolean).slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
        return (
          <div
            key={key}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5"
          >
            <div className="flex items-start gap-2">
              <div className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-[10.5px] font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display flex items-center gap-1 truncate text-[12px] font-semibold text-slate-900">
                  <span className="truncate">{c.full_name || 'Unknown'}</span>
                  {c.email && c.email_status === 'verified' ? (
                    <span title="Verified email">
                      <MailCheck className="h-2.5 w-2.5 shrink-0 text-green-600" />
                    </span>
                  ) : null}
                </div>
                <div className="font-body truncate text-[10.5px] text-slate-500">
                  {c.title || '—'}
                  {c.department ? ` · ${c.department}` : ''}
                </div>
                {/* Reveal block */}
                {revealed ? (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="font-mono inline-flex items-center gap-1 truncate text-[10.5px] text-blue-700 hover:underline"
                      >
                        <Mail className="h-2.5 w-2.5 shrink-0" />
                        {c.email}
                      </a>
                    ) : c.email_status === 'locked' ? (
                      <span
                        className="font-body text-[10.5px] italic text-amber-600"
                        title="Apollo found this contact but their email is gated behind a paid unlock credit."
                      >
                        Email locked — Apollo plan limit
                      </span>
                    ) : (
                      <span className="font-body text-[10.5px] italic text-slate-400">
                        No email on file
                      </span>
                    )}
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        className="font-mono inline-flex items-center gap-1 text-[10.5px] text-slate-700 hover:underline"
                      >
                        <Phone className="h-2.5 w-2.5 shrink-0" />
                        {c.phone}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {/* Side actions */}
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <button
                  type="button"
                  onClick={() => onToggleReveal(key)}
                  disabled={enrichingKeys?.has?.(key)}
                  title={
                    enrichingKeys?.has?.(key)
                      ? 'Enriching…'
                      : revealed
                        ? 'Hide details'
                        : c.email
                          ? 'Reveal email + phone'
                          : 'Reveal email + phone (uses 1 enrichment credit)'
                  }
                  className="font-display inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {enrichingKeys?.has?.(key)
                    ? 'Enriching…'
                    : revealed
                      ? 'Hide'
                      : 'Reveal'}
                </button>
                {c.linkedin_url ? (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open LinkedIn"
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-0.5 text-blue-700 hover:bg-blue-50"
                  >
                    <Linkedin className="h-2.5 w-2.5" />
                  </a>
                ) : null}
              </div>
            </div>
            {(onAddContactToList || onAddContactToCampaign) ? (
              <div className="mt-1.5 flex flex-wrap justify-end gap-1">
                {onAddContactToList ? (
                  <button
                    type="button"
                    onClick={() => onAddContactToList(c)}
                    className="font-display inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                    title="Add this contact to a saved list"
                  >
                    <Bookmark className="h-2.5 w-2.5" />
                    Add to List
                  </button>
                ) : null}
                {onAddContactToCampaign ? (
                  <button
                    type="button"
                    onClick={() => onAddContactToCampaign(c)}
                    className="font-display inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                    title="Add this contact to a campaign"
                  >
                    <Target className="h-2.5 w-2.5" />
                    Add to Campaign
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {contacts.length > 8 ? (
        <div className="font-body text-center text-[10px] text-slate-500">
          +{contacts.length - 8} more — re-run with tighter filters to focus
        </div>
      ) : null}
    </div>
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
