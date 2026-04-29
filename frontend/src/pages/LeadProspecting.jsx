import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Bookmark,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Layers,
  Mail,
  Network,
  Phone,
  PlugZap,
  Radar,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Ship,
  Sparkles,
  Target,
  UserRound,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { searchPulse } from '@/api/pulse';
import { supabase } from '@/lib/supabase';
import AddToCampaignModal from '@/components/command-center/AddToCampaignModal';
import { saveCompany, isLimitExceeded, LimitExceededError } from '@/lib/saveCompany';

const TYPEWRITER_EXAMPLES = [
  'Find SaaS companies in Atlanta hiring sales leaders',
  'Find Shopify brands selling pet products',
  'Find importers of furniture in Georgia',
  'Find operations managers at manufacturing companies in Alabama',
  'Find commercial cleaning companies in Florida',
];

const PROVIDERS = [
  {
    key: 'apollo',
    name: 'Apollo',
    role: 'Broad company & contact search',
    icon: Search,
    tier: 'configured',
  },
  {
    key: 'tavily',
    name: 'Tavily',
    role: 'Web research & company context',
    icon: Globe,
    tier: 'configured',
  },
  {
    key: 'hunter',
    name: 'Hunter',
    role: 'Email discovery & verification',
    icon: Mail,
    tier: 'configured',
  },
  {
    key: 'lusha',
    name: 'Lusha',
    role: 'Contact enrichment (email + phone)',
    icon: UserRound,
    tier: 'optional',
  },
  {
    key: 'phantombuster',
    name: 'PhantomBuster',
    role: 'User-authorized LinkedIn workflows (rate-limited)',
    icon: Network,
    tier: 'optional',
  },
  {
    key: 'explorium',
    name: 'Explorium',
    role: 'Firmographic + prospect API',
    icon: Layers,
    tier: 'paused',
  },
];

const TUTORIAL_STEPS = [
  {
    icon: Wand2,
    title: 'Describe your ICP',
    body: 'Type a plain-English prompt. Pulse parses geography, industry, role, seniority, size, and revenue signals.',
  },
  {
    icon: Search,
    title: 'Apollo + Tavily search',
    body: 'Pulse queries Apollo for companies and people, and Tavily for web research and company context.',
  },
  {
    icon: Sparkles,
    title: 'Verify and enrich',
    body: 'Resolve and verify emails with Hunter (and Lusha when configured) only on the rows you act on. No bulk credit burn.',
  },
  {
    icon: Send,
    title: 'Save & activate',
    body: 'Push selected rows to Command Center, then attach them to a campaign for outbound.',
  },
];

function PulseLogo({ className = '' }) {
  return (
    <div
      className={[
        'relative flex items-center justify-center rounded-2xl bg-slate-950 ring-1 ring-cyan-400/20',
        className,
      ].join(' ')}
    >
      <div className='absolute inset-0 rounded-2xl bg-cyan-400/20 blur-xl' />
      <div className='absolute inset-0 rounded-2xl border border-cyan-300/25' />
      <img
        src='/lit-icon-master.svg'
        alt='Pulse'
        className='relative z-10 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.65)]'
      />
    </div>
  );
}

function TypewriterPlaceholder({ active }) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!active) return;

    const current = TYPEWRITER_EXAMPLES[exampleIndex];
    const speed = deleting ? 24 : 38;

    const timer = setTimeout(() => {
      if (!deleting) {
        const next = current.slice(0, displayText.length + 1);
        setDisplayText(next);

        if (next === current) {
          setTimeout(() => setDeleting(true), 1200);
        }
      } else {
        const next = current.slice(0, Math.max(0, displayText.length - 1));
        setDisplayText(next);

        if (next.length === 0) {
          setDeleting(false);
          setExampleIndex((prev) => (prev + 1) % TYPEWRITER_EXAMPLES.length);
        }
      }
    }, speed);

    return () => clearTimeout(timer);
  }, [active, displayText, deleting, exampleIndex]);

  if (!active) return null;

  return (
    <div className='pointer-events-none absolute left-0 top-0 flex h-full items-start'>
      <span className='text-slate-400'>
        {displayText}
        <span className='ml-0.5 inline-block h-5 w-[1px] animate-pulse bg-slate-400 align-middle' />
      </span>
    </div>
  );
}

function ModeToggle({ value, onChange }) {
  const items = [
    { id: 'companies', label: 'Companies', icon: Building2, disabled: false },
    { id: 'people', label: 'People', icon: UserRound, disabled: false },
    { id: 'auto', label: 'Both', icon: Layers, disabled: false },
    {
      id: 'web',
      label: 'Web signals',
      icon: Radar,
      disabled: true,
      hint: 'Tavily web signals routing ships in the next Pulse phase.',
    },
  ];

  return (
    <div className='inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm'>
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        const disabled = Boolean(item.disabled);

        const stateClass = disabled
          ? 'cursor-not-allowed text-slate-400'
          : active
          ? 'bg-[#4C6FFF] text-white shadow-sm'
          : 'text-slate-600 hover:bg-[#EEF3FF] hover:text-[#17233C]';

        return (
          <button
            key={item.id}
            type='button'
            onClick={() => (disabled ? undefined : onChange(item.id))}
            disabled={disabled}
            title={item.hint || ''}
            className={[
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
              stateClass,
            ].join(' ')}
          >
            <Icon className='h-4 w-4' />
            {item.label}
            {disabled ? (
              <span className='ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500'>
                Soon
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function FreightOverlaySwitch() {
  return (
    <div
      className='inline-flex items-center gap-2 rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500'
      title='ImportYeti and LIT shipment overlay ships in the next Pulse phase.'
    >
      <Ship className='h-3.5 w-3.5 text-slate-400' />
      <span>Freight / import overlay</span>
      <span className='rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500'>
        Soon
      </span>
    </div>
  );
}

function StatusPill({ status }) {
  const value = (status || '').toLowerCase();

  if (value.includes('high') || value.includes('active')) {
    return (
      <span className='inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700'>
        Active
      </span>
    );
  }

  return (
    <span className='inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600'>
      Prospect
    </span>
  );
}

const TIER_PRESENTATION = {
  configured: {
    badge: 'Configured',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    statusLabel: 'Verified at search time',
    statusClass: 'border-blue-200 bg-blue-50 text-blue-700',
    dotClass: 'bg-[#4C6FFF]',
    iconWrapClass: 'bg-[#EEF3FF]',
    iconClass: 'text-[#4C6FFF]',
    title:
      'Frontend cannot read backend secrets. The function reports an error if a key is missing when a search runs.',
  },
  optional: {
    badge: 'Optional',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
    statusLabel: 'Connect later',
    statusClass: 'border-slate-200 bg-slate-50 text-slate-600',
    dotClass: 'bg-slate-400',
    iconWrapClass: 'bg-slate-100',
    iconClass: 'text-slate-600',
    title: 'Optional provider. Pulse works without it; add the key later to enable this surface.',
  },
  paused: {
    badge: 'Paused',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    statusLabel: 'Paused',
    statusClass: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-500',
    iconWrapClass: 'bg-amber-50',
    iconClass: 'text-amber-700',
    title: 'Currently paused. Pulse will not call this provider in this phase.',
  },
};

function ProviderRow({ provider }) {
  const Icon = provider.icon;
  const presentation = TIER_PRESENTATION[provider.tier] || TIER_PRESENTATION.optional;

  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3'>
      <div className='flex min-w-0 items-center gap-3'>
        <div
          className={[
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
            presentation.iconWrapClass,
          ].join(' ')}
        >
          <Icon className={['h-4 w-4', presentation.iconClass].join(' ')} />
        </div>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <span className='truncate text-sm font-semibold text-[#17233C]'>{provider.name}</span>
            <span
              className={[
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                presentation.badgeClass,
              ].join(' ')}
            >
              {presentation.badge}
            </span>
          </div>
          <div className='mt-0.5 truncate text-xs text-slate-500'>{provider.role}</div>
        </div>
      </div>

      <span
        className={[
          'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
          presentation.statusClass,
        ].join(' ')}
        title={presentation.title}
      >
        <span className={['h-1.5 w-1.5 rounded-full', presentation.dotClass].join(' ')} />
        {presentation.statusLabel}
      </span>
    </div>
  );
}

function ProviderReadinessCard({ compact = false }) {
  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
      <header className='mb-4 flex items-start gap-3'>
        <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEF3FF]'>
          <PlugZap className='h-4 w-4 text-[#4C6FFF]' />
        </div>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold text-[#17233C]'>Provider readiness</h3>
          <p className='mt-1 text-xs leading-5 text-slate-500'>
            Setup status is checked server-side when a search runs — the browser cannot read backend
            secrets. If a key is missing the search response will surface the exact provider error.
          </p>
        </div>
      </header>

      <div className={compact ? 'space-y-2' : 'grid gap-2 md:grid-cols-2'}>
        {PROVIDERS.map((p) => (
          <ProviderRow key={p.key} provider={p} />
        ))}
      </div>

      <div className='mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600'>
        <Info className='mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400' />
        <span>
          PhantomBuster, when added, runs only on user authorization and is rate-limited per
          LinkedIn ToS. Pulse does not perform aggressive scraping.
        </span>
      </div>
    </section>
  );
}

function TutorialCard() {
  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
      <header className='mb-4 flex items-start gap-3'>
        <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEF3FF]'>
          <Zap className='h-4 w-4 text-[#4C6FFF]' />
        </div>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold text-[#17233C]'>How Pulse works</h3>
          <p className='mt-1 text-xs leading-5 text-slate-500'>
            One prompt, four steps. From ICP description to a saved, enriched, campaign-ready list.
          </p>
        </div>
      </header>

      <ol className='space-y-3'>
        {TUTORIAL_STEPS.map((step, idx) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className='flex gap-3'>
              <div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white'>
                {idx + 1}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2 text-sm font-semibold text-[#17233C]'>
                  <Icon className='h-3.5 w-3.5 text-[#4C6FFF]' />
                  {step.title}
                </div>
                <p className='mt-1 text-xs leading-5 text-slate-500'>{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
        Searching live business and contact data
      </div>
      <div className='divide-y divide-slate-100'>
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className='flex items-center gap-4 px-4 py-4'>
            <Skeleton className='h-10 w-10 rounded-lg' />
            <div className='flex-1 space-y-2'>
              <Skeleton className='h-3.5 w-1/3' />
              <Skeleton className='h-3 w-1/2' />
            </div>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-3 w-16' />
            <Skeleton className='h-7 w-7 rounded-full' />
          </div>
        ))}
      </div>
    </div>
  );
}

function classifyPulseError(message) {
  if (!message) return 'none';
  const lowered = String(message).toLowerCase();
  if (
    lowered.includes('provider permission issue') ||
    lowered.includes('403') ||
    lowered.includes('endpoint forbidden') ||
    lowered.includes('check api key scopes/plan')
  ) {
    return 'permission';
  }
  if (lowered.includes('not configured') || lowered.includes('disabled')) {
    return 'setup';
  }
  return 'generic';
}

function PermissionIssueState({ message }) {
  return (
    <section className='rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm'>
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white'>
          <ShieldAlert className='h-5 w-5 text-orange-600' />
        </div>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold text-orange-900'>Apollo API permission issue</h3>
          <p className='mt-1 text-sm leading-6 text-orange-800'>
            Your API key exists, but Apollo rejected the endpoint. This usually means the current
            Apollo plan or API scopes do not allow this search endpoint.
          </p>
          <p className='mt-2 text-sm leading-6 text-orange-800'>
            Enable Apollo prospecting API access on the key (or upgrade the plan), or import data
            into your Apollo CRM so the fallback CRM endpoints return results.
          </p>
          {message ? (
            <pre className='mt-3 overflow-x-auto rounded-lg bg-white/70 p-3 font-mono text-[11px] text-orange-900'>
              {message}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EmptySetupState({ message }) {
  return (
    <section className='rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm'>
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white'>
          <Settings className='h-5 w-5 text-amber-600' />
        </div>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold text-amber-900'>Pulse provider setup required</h3>
          <p className='mt-1 text-sm leading-6 text-amber-800'>
            The search backend reported a configuration error. Confirm that
            <span className='mx-1 font-mono text-[12px]'>APOLLO_API_KEY</span>,
            <span className='mx-1 font-mono text-[12px]'>TAVILY_API_KEY</span>, and
            <span className='mx-1 font-mono text-[12px]'>HUNTER_API_KEY</span> are set in your
            Supabase project secrets, redeploy the searchLeads function if needed, then retry.
          </p>
          {message ? (
            <pre className='mt-3 overflow-x-auto rounded-lg bg-white/70 p-3 font-mono text-[11px] text-amber-900'>
              {message}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CompactSearchBar({ query, setQuery, uiMode, setUiMode, onSearch, isSearching }) {
  const showTypewriter = !query.trim();

  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex min-w-0 flex-1 items-start gap-3'>
          <PulseLogo className='mt-1 h-10 w-10 p-2' />

          <div className='min-w-0 flex-1'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <ModeToggle value={uiMode} onChange={setUiMode} />
              <FreightOverlaySwitch />
            </div>

            <div className='relative'>
              <textarea
                rows={2}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className='relative z-10 w-full resize-none border-0 bg-transparent p-0 text-sm text-slate-950 placeholder-transparent focus:outline-none focus:ring-0'
              />
              <TypewriterPlaceholder active={showTypewriter} />
            </div>
          </div>
        </div>

        <button
          type='button'
          onClick={onSearch}
          disabled={isSearching || !query.trim()}
          className='inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#17233C] text-white transition hover:bg-[#1D2C4A] disabled:cursor-not-allowed disabled:opacity-50'
        >
          {isSearching ? <Sparkles className='h-4 w-4 animate-pulse' /> : <ArrowUp className='h-4 w-4' />}
        </button>
      </div>
    </div>
  );
}

function DesktopHero({ query, setQuery, uiMode, setUiMode, onSearch, isSearching }) {
  const showTypewriter = !query.trim();

  return (
    <section className='hidden rounded-[32px] border border-slate-200 bg-white px-8 py-12 shadow-sm md:block'>
      <div className='mx-auto max-w-4xl text-center'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-400'>
          Pulse · AI Prospecting Workspace
        </p>

        <div className='mt-4'>
          <h1 className='text-5xl font-semibold leading-tight tracking-[-0.04em] text-[#17233C]'>
            One prompt. Companies, people, and web signals — ready to enrich.
          </h1>
        </div>

        <p className='mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600'>
          Describe your ideal account or buyer in plain English. Pulse searches across companies,
          people, web signals, and — when configured — freight and import intelligence, then gets
          the best matches ready for outreach inside Logistics Intel.
        </p>

        <div className='mt-8 flex flex-col items-center gap-3'>
          <ModeToggle value={uiMode} onChange={setUiMode} />
          <FreightOverlaySwitch />
        </div>

        <div className='mx-auto mt-8 max-w-4xl rounded-[28px] border border-slate-200 bg-[#FAFBFF] p-5 shadow-sm'>
          <div className='flex items-start gap-4'>
            <PulseLogo className='mt-1 h-12 w-12 p-2.5' />

            <div className='min-w-0 flex-1 text-left'>
              <div className='relative min-h-[120px]'>
                <textarea
                  rows={4}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className='relative z-10 w-full resize-none border-0 bg-transparent p-0 text-base text-slate-950 placeholder-transparent focus:outline-none focus:ring-0'
                />
                <TypewriterPlaceholder active={showTypewriter} />
              </div>

              <div className='mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-4'>
                <p className='text-sm text-slate-500'>
                  Examples: SaaS in Atlanta hiring sales leaders • Shopify brands selling pet
                  products • furniture importers in Georgia
                </p>

                <button
                  type='button'
                  onClick={onSearch}
                  disabled={isSearching || !query.trim()}
                  className='inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#17233C] text-white transition hover:bg-[#1D2C4A] disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {isSearching ? <Sparkles className='h-4 w-4 animate-pulse' /> : <ArrowUp className='h-4 w-4' />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className='mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2'>
          {TYPEWRITER_EXAMPLES.map((chip) => (
            <button
              key={chip}
              type='button'
              onClick={() => setQuery(chip)}
              className='rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[#4C6FFF] hover:bg-[#EEF3FF] hover:text-[#17233C]'
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileSearchOnly({ query, setQuery, uiMode, setUiMode, onSearch, isSearching }) {
  const showTypewriter = !query.trim();

  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:hidden'>
      <div className='mb-3 flex items-center gap-3'>
        <PulseLogo className='h-10 w-10 p-2' />
        <div>
          <div className='text-sm font-semibold text-[#17233C]'>Pulse</div>
          <div className='text-xs text-slate-500'>AI lead intelligence</div>
        </div>
      </div>

      <div className='mb-3 flex flex-col gap-2'>
        <ModeToggle value={uiMode} onChange={setUiMode} />
        <FreightOverlaySwitch />
      </div>

      <div className='relative rounded-2xl border border-slate-200 bg-[#FAFBFF] p-4'>
        <div className='relative min-h-[84px]'>
          <textarea
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className='relative z-10 w-full resize-none border-0 bg-transparent p-0 text-sm text-slate-950 placeholder-transparent focus:outline-none focus:ring-0'
          />
          <TypewriterPlaceholder active={showTypewriter} />
        </div>

        <div className='mt-3 flex justify-end border-t border-slate-200 pt-3'>
          <button
            type='button'
            onClick={onSearch}
            disabled={isSearching || !query.trim()}
            className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#17233C] text-white transition hover:bg-[#1D2C4A] disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isSearching ? <Sparkles className='h-4 w-4 animate-pulse' /> : <ArrowUp className='h-4 w-4' />}
          </button>
        </div>
      </div>
    </section>
  );
}

function ContactDetailDrawer({ contact, open, onClose, onEnrich, isEnriching }) {
  if (!open || !contact) return null;

  return (
    <div className='fixed inset-0 z-50 flex justify-end bg-slate-950/30'>
      <button
        type='button'
        className='absolute inset-0 cursor-default'
        onClick={onClose}
        aria-label='Close'
      />
      <div className='relative h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h3 className='text-xl font-semibold text-[#17233C]'>
              {contact.full_name || 'Unknown Contact'}
            </h3>
            <p className='mt-1 text-sm text-slate-500'>
              {[contact.title, contact.company?.name].filter(Boolean).join(' • ') || 'Contact'}
            </p>
          </div>

          <button
            type='button'
            onClick={onClose}
            className='rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-[#17233C]'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>Company</div>
            <div className='mt-1 text-sm font-medium text-[#17233C]'>{contact.company?.name || '—'}</div>
          </div>

          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>Location</div>
            <div className='mt-1 text-sm text-slate-700'>
              {[contact.company?.city, contact.company?.state, contact.company?.country]
                .filter(Boolean)
                .join(', ') || '—'}
            </div>
          </div>

          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>Email</div>
            <div className='mt-1 text-sm text-slate-700'>{contact.email || 'Not enriched yet'}</div>
          </div>

          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>Phone</div>
            <div className='mt-1 text-sm text-slate-700'>{contact.phone || 'Not enriched yet'}</div>
          </div>

          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>LinkedIn</div>
            <div className='mt-1 text-sm text-slate-700'>
              {contact.linkedin_url ? (
                <a
                  href={contact.linkedin_url}
                  target='_blank'
                  rel='noreferrer'
                  className='text-[#4C6FFF] hover:underline'
                >
                  {contact.linkedin_url}
                </a>
              ) : 'Not available'}
            </div>
          </div>
        </div>

        <div className='mt-6 flex gap-3'>
          <button
            type='button'
            onClick={() => onEnrich(contact)}
            disabled={isEnriching || !contact.prospect_id}
            title={
              !contact.prospect_id
                ? 'Enrichment requires a prospect_id from a provider search result.'
                : ''
            }
            className='inline-flex items-center gap-2 rounded-full bg-[#17233C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D2C4A] disabled:opacity-50'
          >
            {isEnriching ? <Sparkles className='h-4 w-4 animate-pulse' /> : <Mail className='h-4 w-4' />}
            Enrich Contact
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyResultsTable({
  rows,
  selectedIds,
  onToggleSelect,
  onOpenSearch,
  onSaveCompany,
  onAddToCampaign,
}) {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[1080px]'>
          <thead className='border-b border-slate-200 bg-slate-50'>
            <tr className='text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
              <th className='px-4 py-4'></th>
              <th className='px-4 py-4'>Company</th>
              <th className='px-4 py-4'>Domain</th>
              <th className='px-4 py-4'>Location</th>
              <th className='px-4 py-4'>Industry</th>
              <th className='px-4 py-4'>Employees</th>
              <th className='px-4 py-4'>Revenue</th>
              <th className='px-4 py-4'>Status</th>
              <th className='px-4 py-4'>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((company) => (
              <tr key={company.id} className='border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50'>
                <td className='px-4 py-4 align-top'>
                  <Checkbox
                    checked={selectedIds.includes(company.id)}
                    onCheckedChange={(checked) => onToggleSelect(company.id, Boolean(checked))}
                  />
                </td>

                <td className='px-4 py-4 align-top'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-[#EEF3FF]'>
                      <Building2 className='h-4 w-4 text-[#4C6FFF]' />
                    </div>
                    <div>
                      <div className='font-semibold text-[#17233C]'>{company.name}</div>
                      <div className='text-sm text-slate-500'>{company.industry || '—'}</div>
                    </div>
                  </div>
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.domain ? (
                    <a
                      href={company.domain.startsWith('http') ? company.domain : `https://${company.domain}`}
                      target='_blank'
                      rel='noreferrer'
                      className='inline-flex items-center gap-1 text-[#4C6FFF] hover:underline'
                    >
                      {company.domain}
                      <ExternalLink className='h-3 w-3' />
                    </a>
                  ) : '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {[company.city, company.state, company.country].filter(Boolean).join(', ') || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.industry || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.employee_count || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.annual_revenue || '—'}
                </td>

                <td className='px-4 py-4 align-top'>
                  <StatusPill status={company.status} />
                </td>

                <td className='px-4 py-4 align-top'>
                  <div className='flex items-center gap-3 text-slate-500'>
                    <button
                      type='button'
                      onClick={() => onOpenSearch(company)}
                      className='hover:text-[#17233C]'
                      title='Open in Search'
                    >
                      <Eye className='h-4 w-4' />
                    </button>

                    <button
                      type='button'
                      onClick={() => onSaveCompany(company)}
                      className='hover:text-[#4C6FFF]'
                      title='Save to Command Center'
                    >
                      <Bookmark className='h-4 w-4' />
                    </button>

                    <button
                      type='button'
                      onClick={() => onAddToCampaign(company)}
                      className='hover:text-[#4C6FFF]'
                      title='Save and add to Campaign'
                    >
                      <Target className='h-4 w-4' />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeopleResultsTable({
  rows,
  selectedIds,
  onToggleSelect,
  onSaveContact,
  onOpenCompanySearch,
  onViewContact,
  onAddToCampaign,
}) {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[1280px]'>
          <thead className='border-b border-slate-200 bg-slate-50'>
            <tr className='text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
              <th className='px-4 py-4'></th>
              <th className='px-4 py-4'>Contact</th>
              <th className='px-4 py-4'>Title</th>
              <th className='px-4 py-4'>Company</th>
              <th className='px-4 py-4'>Location</th>
              <th className='px-4 py-4'>Email</th>
              <th className='px-4 py-4'>Phone</th>
              <th className='px-4 py-4'>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((person) => (
              <tr key={person.id} className='border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50'>
                <td className='px-4 py-4 align-top'>
                  <Checkbox
                    checked={selectedIds.includes(person.id)}
                    onCheckedChange={(checked) => onToggleSelect(person.id, Boolean(checked))}
                  />
                </td>

                <td className='px-4 py-4 align-top'>
                  <button
                    type='button'
                    onClick={() => onViewContact(person)}
                    className='flex items-start gap-3 text-left'
                  >
                    <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100'>
                      <UserRound className='h-4 w-4 text-slate-500' />
                    </div>
                    <div>
                      <div className='font-semibold text-[#17233C] hover:text-[#4C6FFF]'>
                        {person.full_name || 'Unknown Contact'}
                      </div>
                      <div className='text-sm text-slate-500'>
                        {person.department || person.seniority || 'Contact'}
                      </div>
                    </div>
                  </button>
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>{person.title || '—'}</td>

                <td className='px-4 py-4 align-top'>
                  <div className='font-medium text-[#17233C]'>
                    {person.company?.name || 'Unknown Company'}
                  </div>
                  <div className='text-sm text-slate-500'>{person.company?.industry || '—'}</div>
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {[person.company?.city, person.company?.state, person.company?.country]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {person.email ? (
                    <span className='inline-flex items-center gap-1 rounded-full bg-[#EEF3FF] px-2.5 py-1 font-medium text-[#4C6FFF]'>
                      <Mail className='h-3 w-3' />
                      {person.email}
                    </span>
                  ) : (
                    <span className='inline-flex items-center gap-1 rounded-full border border-dashed border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-400'>
                      Not enriched
                    </span>
                  )}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {person.phone ? (
                    <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700'>
                      <Phone className='h-3 w-3' />
                      {person.phone}
                    </span>
                  ) : '—'}
                </td>

                <td className='px-4 py-4 align-top'>
                  <div className='flex items-center gap-3 text-slate-500'>
                    <button
                      type='button'
                      onClick={() => onSaveContact(person)}
                      className='hover:text-[#4C6FFF]'
                      title='Save to Command Center'
                    >
                      <Bookmark className='h-4 w-4' />
                    </button>

                    <button
                      type='button'
                      onClick={() => onOpenCompanySearch(person.company)}
                      className='hover:text-[#17233C]'
                      title='Open Company in Search'
                    >
                      <Eye className='h-4 w-4' />
                    </button>

                    <button
                      type='button'
                      onClick={() => onAddToCampaign(person)}
                      className='hover:text-[#4C6FFF]'
                      title='Save company and add to Campaign'
                    >
                      <Target className='h-4 w-4' />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LeadProspecting() {
  const [uiMode, setUiMode] = useState('auto');
  const [query, setQuery] = useState('');
  const [resultMode, setResultMode] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [meta, setMeta] = useState(null);
  const [apiStatus, setApiStatus] = useState('unknown');
  const [activeContact, setActiveContact] = useState(null);
  const [campaignTarget, setCampaignTarget] = useState(null);

  const isPeopleMode = resultMode === 'people';
  const isCompanyMode =
    resultMode === 'companies' || resultMode === 'hybrid_people_over_company';

  const errorClass = useMemo(
    () => classifyPulseError(errorMessage),
    [errorMessage],
  );
  const isSetupError = errorClass === 'setup';
  const isPermissionError = errorClass === 'permission';

  const statusPill = useMemo(() => {
    if (apiStatus === 'connected') {
      return (
        <span className='inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700'>
          <CheckCircle2 className='h-3 w-3' />
          Provider response received
        </span>
      );
    }

    if (apiStatus === 'error') {
      if (isPermissionError) {
        return (
          <span className='inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800'>
            <ShieldAlert className='h-3 w-3' />
            Provider permission issue
          </span>
        );
      }
      if (isSetupError) {
        return (
          <span className='inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700'>
            <AlertCircle className='h-3 w-3' />
            Setup required
          </span>
        );
      }
      return (
        <span className='inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700'>
          <AlertCircle className='h-3 w-3' />
          Search error
        </span>
      );
    }

    return null;
  }, [apiStatus, isPermissionError, isSetupError]);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setErrorMessage('');
    setSearchPerformed(false);
    setSelectedIds([]);

    try {
      const response = await searchPulse({
        query: trimmed,
        ui_mode: uiMode,
      });

      setApiStatus(response?.ok && !response?.error ? 'connected' : 'error');
      setResults(Array.isArray(response?.data?.results) ? response.data.results : []);
      setResultMode(response?.mode || 'companies');
      setMeta(response?.meta || null);
      setSearchPerformed(true);

      if (response?.error) {
        setErrorMessage(response.error);
      } else if (!response?.data?.results?.length) {
        setErrorMessage(
          response?.mode === 'people'
            ? 'No matching contacts were found. Try a broader title, different department, or wider company set.'
            : 'No companies matched this search. Try widening geography, lowering thresholds, or simplifying the prompt.',
        );
      }
    } catch (error) {
      console.error('[Pulse] search failed:', error);
      setApiStatus('error');
      setResults([]);
      setResultMode(null);
      setMeta(null);
      setSearchPerformed(true);
      setErrorMessage(error?.message || 'Pulse search failed.');
    } finally {
      setIsSearching(false);
    }
  }

  function toggleSelected(id, checked) {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id),
    );
  }

  // Routes through the gated save-company Edge Function. Returns the
  // canonical lit_companies row (with id) so callers chaining contact
  // saves / campaign add can use companyRow.id. On quota failure throws
  // a LimitExceededError; on other failures throws Error. NEVER writes
  // to lit_companies directly from the browser anymore — the Edge
  // Function does that AFTER it has passed the quota gate.
  async function upsertCompanyFromResult(company) {
    const sourceKey =
      company.business_id || company.id || company.domain || company.name;
    const result = await saveCompany({
      source_company_key: sourceKey,
      company_data: {
        source: 'pulse',
        source_company_key: sourceKey,
        name: company.name || 'Unknown Company',
        domain: company.domain || null,
        website: company.website || null,
        city: company.city || null,
        state: company.state || null,
        country_code: company.country || null,
      },
      stage: 'prospect',
    });

    if (!result.ok) {
      if (isLimitExceeded(result)) {
        throw new LimitExceededError(result);
      }
      throw new Error(result.message || 'Save failed');
    }

    const co = result.company;
    return {
      id: co?.id,
      source_company_key: co?.source_company_key,
      name: co?.name,
    };
  }

  async function handleSaveCompany(company) {
    try {
      await upsertCompanyFromResult(company);
    } catch (error) {
      console.error('[Pulse] save company failed:', error);
      if (error instanceof LimitExceededError) {
        setErrorMessage(error.message + ' Upgrade at /app/billing.');
      } else {
        setErrorMessage(error?.message || 'Failed to save company.');
      }
    }
  }

  async function handleSaveContact(person) {
    try {
      const companyRow = await upsertCompanyFromResult(person.company || {});

      const { error } = await supabase
        .from('lit_contacts')
        .insert({
          company_id: companyRow.id,
          full_name: person.full_name || null,
          title: person.title || null,
          dept: person.department || null,
          email: person.email || null,
          phone: person.phone || null,
          linkedin: person.linkedin_url || null,
          source: 'pulse',
          verified: Boolean(person.email || person.phone),
        });

      if (error) throw error;
    } catch (error) {
      console.error('[Pulse] save contact failed:', error);
      setErrorMessage(error?.message || 'Failed to save contact.');
    }
  }

  async function handleAddToCampaign(row) {
    setErrorMessage('');
    try {
      const companyLike = row?.type === 'person' ? row.company || {} : row;
      const saved = await upsertCompanyFromResult(companyLike);
      if (!saved?.id) throw new Error('Failed to save company before campaign assignment.');

      if (row?.type === 'person') {
        // Persist the contact too so Command Center has a contact row alongside the company.
        try {
          await supabase.from('lit_contacts').insert({
            company_id: saved.id,
            full_name: row.full_name || null,
            title: row.title || null,
            dept: row.department || null,
            email: row.email || null,
            phone: row.phone || null,
            linkedin: row.linkedin_url || null,
            source: 'pulse',
            verified: Boolean(row.email || row.phone),
          });
        } catch (contactErr) {
          console.warn('[Pulse] save contact (during add-to-campaign) failed:', contactErr);
        }
      }

      setCampaignTarget({ company_id: saved.id, name: saved.name });
    } catch (error) {
      console.error('[Pulse] add to campaign failed:', error);
      setErrorMessage(error?.message || 'Failed to prepare row for campaign.');
    }
  }

  async function enrichContact(contact) {
    if (!contact?.prospect_id) {
      setErrorMessage('This contact does not have a prospect_id and cannot be enriched.');
      return;
    }

    setIsEnriching(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.functions.invoke('searchLeads', {
        body: {
          action: 'enrich_contact',
          prospect_id: contact.prospect_id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const enrichment = data?.data?.contact || {};

      const updated = {
        ...contact,
        email: enrichment?.email || contact.email,
        phone: enrichment?.phone || contact.phone,
        linkedin_url: enrichment?.linkedin_url || contact.linkedin_url,
      };

      setActiveContact(updated);
      setResults((prev) => prev.map((item) => (item.id === contact.id ? updated : item)));
    } catch (error) {
      console.error('[Pulse] enrich contact failed:', error);
      setErrorMessage(error?.message || 'Failed to enrich contact.');
    } finally {
      setIsEnriching(false);
    }
  }

  async function importSelected() {
    if (!selectedIds.length) return;

    setIsImporting(true);
    setErrorMessage('');

    try {
      const selected = results.filter((item) => selectedIds.includes(item.id));

      for (const item of selected) {
        if (item.type === 'person') {
          await handleSaveContact(item);
        } else {
          await handleSaveCompany(item);
        }
      }

      setSelectedIds([]);
    } catch (error) {
      console.error('[Pulse] import failed:', error);
      setErrorMessage(error?.message || 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  function openInSearch(companyLike) {
    const name = companyLike?.name || companyLike?.company?.name || '';
    const searchPath = `/app/search?q=${encodeURIComponent(name)}`;
    window.location.href = searchPath;
  }

  const resultCount = meta?.total ?? results.length;

  return (
    <div className='space-y-6 px-[10px] pb-10'>
      {!searchPerformed && (
        <>
          <DesktopHero
            query={query}
            setQuery={setQuery}
            uiMode={uiMode}
            setUiMode={setUiMode}
            onSearch={handleSearch}
            isSearching={isSearching}
          />

          <MobileSearchOnly
            query={query}
            setQuery={setQuery}
            uiMode={uiMode}
            setUiMode={setUiMode}
            onSearch={handleSearch}
            isSearching={isSearching}
          />

          <section className='grid gap-4 lg:grid-cols-2'>
            <TutorialCard />
            <ProviderReadinessCard />
          </section>
        </>
      )}

      {searchPerformed && (
        <CompactSearchBar
          query={query}
          setQuery={setQuery}
          uiMode={uiMode}
          setUiMode={setUiMode}
          onSearch={handleSearch}
          isSearching={isSearching}
        />
      )}

      {statusPill ? <div className='flex justify-end'>{statusPill}</div> : null}

      {errorMessage && !isSetupError && !isPermissionError ? (
        <div className='flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
          <AlertCircle className='mt-0.5 h-5 w-5 flex-shrink-0' />
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {isSearching ? (
        <ResultsSkeleton />
      ) : searchPerformed && isPermissionError ? (
        <div className='space-y-4'>
          <PermissionIssueState message={errorMessage} />
          <ProviderReadinessCard />
        </div>
      ) : searchPerformed && isSetupError ? (
        <div className='space-y-4'>
          <EmptySetupState message={errorMessage} />
          <ProviderReadinessCard />
        </div>
      ) : searchPerformed ? (
        <section className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <div>
              <div className='text-sm font-semibold text-[#17233C]'>
                {resultCount} result{resultCount === 1 ? '' : 's'}
              </div>
              <div className='mt-1 text-sm text-slate-500'>
                Mode: {resultMode || 'unknown'}
                {meta?.requestedLimit ? ` • Limit ${meta.requestedLimit}` : ''}
                {meta?.matchedCompanyName ? ` • Match ${meta.matchedCompanyName}` : ''}
                {meta?.provider ? ` • Provider ${meta.provider}` : ''}
              </div>
            </div>

            <button
              type='button'
              onClick={importSelected}
              disabled={!selectedIds.length || isImporting}
              className='inline-flex items-center gap-2 rounded-full bg-[#17233C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D2C4A] disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isImporting ? <Sparkles className='h-4 w-4 animate-pulse' /> : <Bookmark className='h-4 w-4' />}
              Save Selected to Command Center
            </button>
          </div>

          {isPeopleMode ? (
            <PeopleResultsTable
              rows={results}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onSaveContact={handleSaveContact}
              onOpenCompanySearch={openInSearch}
              onViewContact={setActiveContact}
              onAddToCampaign={handleAddToCampaign}
            />
          ) : isCompanyMode ? (
            <CompanyResultsTable
              rows={results}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onOpenSearch={openInSearch}
              onSaveCompany={handleSaveCompany}
              onAddToCampaign={handleAddToCampaign}
            />
          ) : (
            <div className='rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm'>
              No supported result mode returned.
            </div>
          )}
        </section>
      ) : null}

      <ContactDetailDrawer
        contact={activeContact}
        open={Boolean(activeContact)}
        onClose={() => setActiveContact(null)}
        onEnrich={enrichContact}
        isEnriching={isEnriching}
      />

      <AddToCampaignModal
        open={Boolean(campaignTarget)}
        onClose={() => setCampaignTarget(null)}
        company={campaignTarget || { name: '' }}
      />
    </div>
  );
}