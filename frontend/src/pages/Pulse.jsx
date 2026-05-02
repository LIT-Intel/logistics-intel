// Pulse — universal business-intelligence search.
//
// Replaces the legacy LeadProspecting hero with a single hero-first surface:
// rotating placeholder, intent-detection chips, prompt category gallery,
// stepwise loading, and a results view that lights up Industry / Trade
// insight cards conditionally based on detected intent.
//
// Save / enrich / campaign flows are unchanged — they reuse the same
// gated `saveCompany` edge fn and `searchPulse` API as the legacy page.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle,
  ChevronRight,
  Compass,
  Filter,
  GitBranch,
  Layers,
  MapPin,
  PlugZap,
  Search,
  Ship,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

import { searchPulse } from '@/api/pulse';
import { supabase } from '@/lib/supabase';
import AddToCampaignModal from '@/components/command-center/AddToCampaignModal';
import { saveCompany, isLimitExceeded, LimitExceededError } from '@/lib/saveCompany';

import {
  classifyPulseError,
  CompanyResultsTable,
  ContactDetailDrawer,
  EmptySetupState,
  ErrorBanner,
  PeopleResultsTable,
  PermissionIssueState,
  ResultsSkeleton,
} from '@/features/pulse/PulseResults';

const PLACEHOLDER_EXAMPLES = [
  'Find marketing directors at SaaS companies in California',
  'Top furniture companies importing from Vietnam',
  'Fintech startups hiring operations managers',
  'Mid-sized logistics companies in Atlanta',
  'E-commerce brands shipping from China',
  'Procurement managers at electronics importers',
  'Companies similar to Nike',
  'Retail brands in Texas with high shipment volume',
];

const PROMPT_CATEGORIES = [
  {
    id: 'companies',
    label: 'Companies',
    icon: Building2,
    accent: 'text-[#3b82f6] bg-[#3b82f6]/10',
    prompts: [
      'AI startups in New York with Series B funding',
      'Furniture brands in North Carolina',
      'Companies similar to Shopify',
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: User,
    accent: 'text-[#8b5cf6] bg-[#8b5cf6]/10',
    prompts: [
      'VPs of Supply Chain at retail companies',
      'Marketing directors at D2C brands',
      'Heads of procurement at electronics importers',
    ],
  },
  {
    id: 'industries',
    label: 'Industries',
    icon: Layers,
    accent: 'text-[#10b981] bg-[#10b981]/10',
    prompts: [
      'Fastest-growing categories in consumer electronics',
      'SaaS companies in healthcare',
      'Cold-chain logistics providers',
    ],
  },
  {
    id: 'locations',
    label: 'Locations',
    icon: MapPin,
    accent: 'text-[#f59e0b] bg-[#f59e0b]/10',
    prompts: [
      'Importers clustered around the port of Savannah',
      'Logistics companies in the DFW corridor',
      'E-commerce brands in LA metro',
    ],
  },
  {
    id: 'trade',
    label: 'Trade Intelligence',
    icon: Ship,
    accent: 'text-[#06b6d4] bg-[#06b6d4]/10',
    prompts: [
      'Top shippers on the Shanghai → LA lane',
      'Furniture importing from Vietnam in last 90 days',
      'Companies with high TEU growth YoY',
    ],
  },
];

const EXPLORATIONS = [
  { title: 'What SaaS companies are scaling fastest in Texas?', tag: 'Industry · Location', icon: TrendingUp },
  { title: 'Who are the top furniture importers from Vietnam?',  tag: 'Trade · Industry',    icon: Ship },
  { title: 'Marketing leaders at D2C brands hiring right now',   tag: 'Contacts · Hiring',   icon: UserPlus },
  { title: 'Companies similar to Patagonia',                     tag: 'Lookalike',           icon: GitBranch },
];

const LOADING_STEPS = [
  'Parsing intent…',
  'Matching companies…',
  'Checking shipment data…',
  'Enriching contacts…',
];

const ROLE_RX     = /\b(director|manager|vp|head of|chief|cto|ceo|cfo|founder|lead|officer)\b/i;
const TRADE_RX    = /\b(teu|lane|shipment|import|export|carrier|port|cargo|freight|logistics|furniture|vietnam|china)\b/i;
const LOCATION_RX = /\b(in|from|near|around)\s+(texas|california|new york|atlanta|china|vietnam|asia|europe|usa|us|savannah|la|nyc|sf)\b/i;
const INDUSTRY_RX = /\b(saas|fintech|ecommerce|e-commerce|retail|logistics|furniture|electronics|apparel|healthcare|consumer|d2c|b2b|startups?)\b/i;
const SIMILAR_RX  = /\b(similar to|like)\b/i;

function detectIntent(q) {
  if (!q.trim()) return null;
  const hits = [];
  if (ROLE_RX.test(q))     hits.push({ key: 'contacts',   label: 'Contact search' });
  if (TRADE_RX.test(q))    hits.push({ key: 'trade',      label: 'Trade intelligence' });
  if (SIMILAR_RX.test(q))  hits.push({ key: 'companies',  label: 'Lookalike companies' });
  if (INDUSTRY_RX.test(q)) hits.push({ key: 'industries', label: 'Industry filter' });
  if (LOCATION_RX.test(q)) hits.push({ key: 'locations',  label: 'Location filter' });
  if (!hits.length)        hits.push({ key: 'companies',  label: 'Company search' });
  return hits.slice(0, 3);
}

// Map server-returned mode → uiMode the searchPulse fn accepts.
// Currently we always send 'auto' so the backend decides; chips are advisory.
const RESULT_FILTERS = ['All', 'Companies', 'Contacts', 'Industries', 'Trade'];

export default function Pulse() {
  // — search state —
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [resultMode, setResultMode] = useState(null);
  const [meta, setMeta] = useState(null);
  const [apiStatus, setApiStatus] = useState('unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // — selection / actions —
  const [selectedIds, setSelectedIds] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [activeContact, setActiveContact] = useState(null);
  const [campaignTarget, setCampaignTarget] = useState(null);

  // — UI flourishes —
  const [phIdx, setPhIdx] = useState(0);
  const [resultFilter, setResultFilter] = useState('All');
  const inputRef = useRef(null);

  useEffect(() => {
    if (query) return;
    const t = setInterval(() => {
      setPhIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3200);
    return () => clearInterval(t);
  }, [query]);

  const intent = useMemo(() => detectIntent(query), [query]);

  const errorClass = useMemo(() => classifyPulseError(errorMessage), [errorMessage]);
  const isSetupError = errorClass === 'setup';
  const isPermissionError = errorClass === 'permission';

  const isPeopleMode  = resultMode === 'people';
  const isCompanyMode = resultMode === 'companies' || resultMode === 'hybrid_people_over_company';

  // Conditional insight cards — show when intent suggests them.
  const showIndustryInsight = useMemo(
    () => searchPerformed && (INDUSTRY_RX.test(submittedQuery) || TRADE_RX.test(submittedQuery)),
    [searchPerformed, submittedQuery],
  );
  const showTradeInsight = useMemo(
    () => searchPerformed && TRADE_RX.test(submittedQuery),
    [searchPerformed, submittedQuery],
  );

  async function runSearch(rawQuery) {
    const trimmed = (rawQuery ?? query).trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setIsSearching(true);
    setErrorMessage('');
    setSearchPerformed(false);
    setSelectedIds([]);

    try {
      const response = await searchPulse({ query: trimmed, ui_mode: 'auto' });
      setApiStatus(response?.ok && !response?.error ? 'connected' : 'error');
      setResults(Array.isArray(response?.data?.results) ? response.data.results : []);
      setResultMode(response?.mode || 'companies');
      setMeta(response?.meta || null);
      setSubmittedQuery(trimmed);
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
      setSubmittedQuery(trimmed);
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

  // —— Save / enrich / campaign — preserved from LeadProspecting ——
  async function upsertCompanyFromResult(company) {
    const sourceKey = company.business_id || company.id || company.domain || company.name;
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
      if (isLimitExceeded(result)) throw new LimitExceededError(result);
      throw new Error(result.message || 'Save failed');
    }
    const co = result.company;
    return { id: co?.id, source_company_key: co?.source_company_key, name: co?.name };
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
      const { error } = await supabase.from('lit_contacts').insert({
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
      if (error instanceof LimitExceededError) {
        setErrorMessage(error.message + ' Upgrade at /app/billing.');
      } else {
        setErrorMessage(error?.message || 'Failed to prepare row for campaign.');
      }
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
        body: { action: 'enrich_contact', prospect_id: contact.prospect_id },
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
        if (item.type === 'person') await handleSaveContact(item);
        else await handleSaveCompany(item);
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
    window.location.href = `/app/search?q=${encodeURIComponent(name)}`;
  }

  const resultCount = meta?.total ?? results.length;

  return (
    <div className='relative flex-1 overflow-x-hidden bg-gradient-to-b from-[#FAFBFD] to-[#F4F6FB]'>
      {/* Ambient gradient backdrop */}
      <div
        aria-hidden
        className='pointer-events-none absolute -top-32 left-1/2 -z-0 h-[420px] w-[820px] -translate-x-1/2 blur-md'
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(59,130,246,0.13), rgba(139,92,246,0.08) 55%, transparent 75%)',
        }}
      />

      <div className='relative z-10 mx-auto max-w-[1120px] px-6 pb-20 pt-10 md:px-9 md:pt-12'>
        {/* Eyebrow */}
        <div className='inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium tracking-wide text-slate-600 shadow-sm'>
          <span className='h-1.5 w-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.55)]' />
          Pulse · Universal business intelligence
        </div>

        {/* Title */}
        <h1 className='mt-4 text-balance text-4xl font-bold leading-[1.1] tracking-tight text-[#0F172A] md:text-5xl'>
          Ask anything about{' '}
          <span className='bg-gradient-to-r from-[#3b82f6] via-[#8b5cf6] to-[#06b6d4] bg-clip-text text-transparent'>
            any company, contact, or market.
          </span>
        </h1>
        <p className='mt-3 max-w-[620px] text-[15px] leading-relaxed text-slate-600'>
          One search bar across company data, contact enrichment, industry signals, and trade intelligence.
        </p>

        {/* Hero search card */}
        <div className='mt-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_36px_rgba(15,23,42,0.07),0_2px_6px_rgba(15,23,42,0.04)]'>
          <div className='flex items-center gap-2.5 px-1 py-1.5'>
            <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF]'>
              <Sparkles className='h-[18px] w-[18px] text-[#3b82f6]' />
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder={PLACEHOLDER_EXAMPLES[phIdx]}
              className='flex-1 border-0 bg-transparent py-2.5 text-base text-[#0F172A] outline-none placeholder:text-slate-400'
            />
            {query ? (
              <button
                type='button'
                onClick={() => { setQuery(''); setSubmittedQuery(''); setSearchPerformed(false); setResults([]); setMeta(null); }}
                aria-label='Clear search'
                className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            ) : null}
            <button
              type='button'
              onClick={() => runSearch()}
              disabled={isSearching || !query.trim()}
              className='inline-flex flex-shrink-0 items-center gap-1.5 rounded-[10px] bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(59,130,246,0.35)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60'
            >
              {isSearching ? (
                <Sparkles className='h-3.5 w-3.5 animate-pulse' />
              ) : (
                <ArrowRight className='h-3.5 w-3.5' />
              )}
              Ask Pulse
            </button>
          </div>

          {/* Intent strip */}
          <div className='flex flex-wrap items-center gap-2 border-t border-slate-100 px-1 pb-1 pt-2.5'>
            <div className='inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-slate-400'>
              <Wand2 className='h-2.5 w-2.5' />
              Interpreting as
            </div>
            {intent ? (
              intent.map((h) => (
                <span
                  key={h.key}
                  className='rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#3b82f6]'
                >
                  {h.label}
                </span>
              ))
            ) : (
              <span className='rounded-full border border-slate-100 bg-slate-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-300'>
                — start typing —
              </span>
            )}
            <div className='ml-auto inline-flex items-center gap-2 text-[11px] text-slate-500'>
              <span className='inline-flex items-center gap-1.5'>
                <span className='h-1.5 w-1.5 rounded-full bg-[#3b82f6]' /> Apollo
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='h-1.5 w-1.5 rounded-full bg-[#3b82f6]' /> Tavily
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='h-1.5 w-1.5 rounded-full bg-[#3b82f6]' /> Hunter
              </span>
              <span className='inline-flex items-center gap-1.5 text-slate-400'>
                <span className='h-1.5 w-1.5 rounded-full bg-slate-300' /> Lusha
              </span>
            </div>
          </div>
        </div>

        {/* Prompt category gallery — only on idle (no submitted query) */}
        {!searchPerformed && !isSearching ? (
          <div className='mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5'>
            {PROMPT_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.id}
                  className='rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.03)]'
                >
                  <div className='mb-2.5 flex items-center gap-1.5'>
                    <div className={['flex h-[22px] w-[22px] items-center justify-center rounded-md', cat.accent].join(' ')}>
                      <Icon className='h-[13px] w-[13px]' />
                    </div>
                    <span className='text-[12px] font-bold tracking-tight text-[#0F172A]'>{cat.label}</span>
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    {cat.prompts.map((p) => (
                      <button
                        key={p}
                        type='button'
                        onClick={() => runSearch(p)}
                        className='rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-left text-[11.5px] leading-snug text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-[#0F172A]'
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Loading */}
        {isSearching ? <PulseLoading /> : null}

        {/* Empty / explore state */}
        {!isSearching && !searchPerformed ? <ExploreState onPick={runSearch} /> : null}

        {/* Search status / errors */}
        {searchPerformed && !isSearching ? (
          <>
            {errorMessage && !isSetupError && !isPermissionError ? (
              <div className='mt-4'>
                <ErrorBanner message={errorMessage} />
              </div>
            ) : null}

            {isPermissionError ? (
              <div className='mt-4'>
                <PermissionIssueState message={errorMessage} />
              </div>
            ) : isSetupError ? (
              <div className='mt-4'>
                <EmptySetupState message={errorMessage} />
              </div>
            ) : (
              <ResultsView
                query={submittedQuery}
                results={results}
                resultCount={resultCount}
                resultMode={resultMode}
                meta={meta}
                apiStatus={apiStatus}
                isPeopleMode={isPeopleMode}
                isCompanyMode={isCompanyMode}
                selectedIds={selectedIds}
                isImporting={isImporting}
                onToggleSelect={toggleSelected}
                onSaveCompany={handleSaveCompany}
                onSaveContact={handleSaveContact}
                onAddToCampaign={handleAddToCampaign}
                onOpenSearch={openInSearch}
                onViewContact={setActiveContact}
                onImportSelected={importSelected}
                resultFilter={resultFilter}
                setResultFilter={setResultFilter}
                showIndustryInsight={showIndustryInsight}
                showTradeInsight={showTradeInsight}
              />
            )}
          </>
        ) : null}
      </div>

      {/* Drawers / modals */}
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

/* ─────────── Sub-components ─────────── */

function PulseLoading() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => Math.min(a + 1, LOADING_STEPS.length - 1)), 320);
    return () => clearInterval(t);
  }, []);
  return (
    <div className='mt-6 flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]'>
      {LOADING_STEPS.map((s, i) => {
        const done = i < active;
        const now = i === active;
        return (
          <div key={s} className='flex items-center gap-2.5' style={{ opacity: i > active ? 0.45 : 1 }}>
            <div className='flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-slate-100'>
              {done ? <CheckCircle className='h-2.5 w-2.5 text-green-600' /> : null}
              {now ? (
                <span className='h-2.5 w-2.5 animate-spin rounded-full border-2 border-blue-100 border-t-[#3b82f6]' />
              ) : null}
              {!done && !now ? <span className='h-1.5 w-1.5 rounded-full bg-slate-300' /> : null}
            </div>
            <span
              className={[
                'text-[13px]',
                done ? 'font-medium text-slate-600' : now ? 'font-semibold text-[#0F172A]' : 'font-medium text-slate-400',
              ].join(' ')}
            >
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ExploreState({ onPick }) {
  return (
    <div className='mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]'>
      <div className='mb-4 flex items-center gap-2.5'>
        <div className='flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF]'>
          <Compass className='h-[15px] w-[15px] text-[#3b82f6]' />
        </div>
        <div>
          <div className='text-[15px] font-bold text-[#0F172A]'>Start with an exploration</div>
          <div className='mt-0.5 text-[12px] text-slate-500'>
            Pulse works best when you describe what you're looking for — not just keywords.
          </div>
        </div>
      </div>
      <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2'>
        {EXPLORATIONS.map((e) => {
          const Icon = e.icon;
          return (
            <button
              key={e.title}
              type='button'
              onClick={() => onPick(e.title)}
              className='flex items-center gap-3 rounded-[10px] border border-slate-100 bg-slate-50 px-3.5 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50'
            >
              <div className='flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-blue-50'>
                <Icon className='h-3.5 w-3.5 text-[#3b82f6]' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='text-[13px] font-semibold text-[#0F172A]'>{e.title}</div>
                <div className='mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400'>{e.tag}</div>
              </div>
              <ChevronRight className='h-3.5 w-3.5 flex-shrink-0 text-slate-300' />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultsView({
  query,
  results,
  resultCount,
  resultMode,
  meta,
  apiStatus,
  isPeopleMode,
  isCompanyMode,
  selectedIds,
  isImporting,
  onToggleSelect,
  onSaveCompany,
  onSaveContact,
  onAddToCampaign,
  onOpenSearch,
  onViewContact,
  onImportSelected,
  resultFilter,
  setResultFilter,
  showIndustryInsight,
  showTradeInsight,
}) {
  return (
    <div className='mt-5 flex flex-col gap-3.5'>
      {/* Summary strip */}
      <div className='flex flex-wrap items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'>
        <span className='text-[12px] text-slate-500'>
          Results for <span className='font-semibold text-[#0F172A]'>“{query}”</span>
          {meta?.provider ? <span className='ml-2 text-slate-400'>· via {meta.provider}</span> : null}
          {meta?.requestedLimit ? <span className='ml-2 text-slate-400'>· limit {meta.requestedLimit}</span> : null}
        </span>
        <div className='flex gap-1.5'>
          {RESULT_FILTERS.map((t) => (
            <button
              key={t}
              type='button'
              onClick={() => setResultFilter(t)}
              className={[
                'rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                resultFilter === t ? 'bg-blue-50 text-[#3b82f6]' : 'text-slate-500 hover:text-[#0F172A]',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
        <div className='ml-auto flex items-center gap-2'>
          <span className='text-[11px] text-slate-500'>
            {resultCount} result{resultCount === 1 ? '' : 's'} · mode {resultMode || 'unknown'}
            {apiStatus === 'connected' ? (
              <span className='ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-green-700'>
                <CheckCircle className='h-2.5 w-2.5' />
                live
              </span>
            ) : null}
          </span>
          <button
            type='button'
            onClick={onImportSelected}
            disabled={!selectedIds.length || isImporting}
            className='inline-flex items-center gap-1.5 rounded-full bg-[#17233C] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#1D2C4A] disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isImporting ? <Sparkles className='h-3 w-3 animate-pulse' /> : <ArrowRight className='h-3 w-3' />}
            Save selected
          </button>
          <button
            type='button'
            disabled
            title='Advanced filters coming next'
            className='inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-500 disabled:opacity-60'
          >
            <SlidersHorizontal className='h-3 w-3' />
            Advanced
          </button>
        </div>
      </div>

      {/* Industry insight */}
      {showIndustryInsight ? (
        <ResultSection label='Industry insight' Icon={Layers} accent='#10b981'>
          <InsightCard
            title='Inferred industry segment'
            subtitle={meta?.classificationReasons?.[0] || 'Inferred from query'}
            primary={meta?.estimatedMarketSize ? `${meta.estimatedMarketSize.toLocaleString()} cos.` : `${resultCount} matches`}
            primaryLabel={meta?.estimatedMarketSize ? 'estimated market' : 'in this batch'}
            note={
              meta?.classificationReasons?.length
                ? meta.classificationReasons.slice(0, 2).join(' · ')
                : 'Run another query with explicit industry terms to refine the segment estimate.'
            }
            Icon={Layers}
            accent='#10b981'
          />
        </ResultSection>
      ) : null}

      {/* Trade lane insight */}
      {showTradeInsight ? (
        <ResultSection label='Trade lane intelligence' Icon={Ship} accent='#06b6d4'>
          <InsightCard
            title='Trade signals detected'
            subtitle='Lane-aware ranking will boost shippers with active TEU on matching origins'
            primary='Beta'
            primaryLabel='shipment overlay'
            note='Connect ImportYeti to surface lane-level shipper rankings inside Pulse results.'
            Icon={Ship}
            accent='#06b6d4'
          />
        </ResultSection>
      ) : null}

      {/* Companies / Contacts table */}
      <ResultSection
        label={isPeopleMode ? 'Contacts' : 'Companies'}
        Icon={isPeopleMode ? User : Building2}
        accent={isPeopleMode ? '#8b5cf6' : '#3b82f6'}
        count={resultCount}
      >
        {isPeopleMode ? (
          <PeopleResultsTable
            rows={results}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onSaveContact={onSaveContact}
            onOpenCompanySearch={onOpenSearch}
            onViewContact={onViewContact}
            onAddToCampaign={onAddToCampaign}
          />
        ) : isCompanyMode ? (
          <CompanyResultsTable
            rows={results}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onOpenSearch={onOpenSearch}
            onSaveCompany={onSaveCompany}
            onAddToCampaign={onAddToCampaign}
          />
        ) : (
          <div className='rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm'>
            No supported result mode returned.
          </div>
        )}
      </ResultSection>

      {/* Contacts hint when companies mode but query suggests people */}
      {isCompanyMode && ROLE_RX.test(query) ? (
        <ResultSection label='Contacts' Icon={User} accent='#8b5cf6'>
          <div className='flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4'>
            <div className='flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#F5F3FF]'>
              <PlugZap className='h-4 w-4 text-[#8b5cf6]' />
            </div>
            <div className='flex-1'>
              <div className='text-[13.5px] font-semibold text-[#0F172A]'>
                Contact-level results not returned for this query
              </div>
              <div className='mt-0.5 text-[12px] text-slate-500'>
                Re-phrase with an explicit job title (e.g. “VPs of supply chain at retail companies”) to switch Pulse into people mode.
              </div>
            </div>
          </div>
        </ResultSection>
      ) : null}
    </div>
  );
}

function ResultSection({ label, Icon, accent, count, children }) {
  return (
    <div>
      <div className='mb-2.5 flex items-center gap-2 px-0.5'>
        <div
          className='flex h-5 w-5 items-center justify-center rounded'
          style={{ background: `${accent}26`, color: accent }}
        >
          <Icon className='h-3 w-3' />
        </div>
        <span className='text-[13px] font-bold tracking-tight text-[#0F172A]'>{label}</span>
        {count != null ? (
          <span className='rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-slate-500'>
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function InsightCard({ title, subtitle, primary, primaryLabel, note, Icon, accent }) {
  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]'>
      <div className='flex items-center gap-3'>
        <div
          className='flex h-8 w-8 items-center justify-center rounded-lg'
          style={{ background: `${accent}1F` }}
        >
          <Icon className='h-[15px] w-[15px]' style={{ color: accent }} />
        </div>
        <div className='flex-1'>
          <div className='text-[14px] font-bold text-[#0F172A]'>{title}</div>
          <div className='mt-0.5 text-[11px] text-slate-500'>{subtitle}</div>
        </div>
        <div className='text-right'>
          <div className='font-mono text-[18px] font-semibold text-blue-700'>{primary}</div>
          <div className='text-[10px] font-semibold uppercase tracking-wider text-slate-400'>{primaryLabel}</div>
        </div>
      </div>
      {note ? (
        <div className='mt-2.5 border-t border-slate-100 pt-2.5 text-[12.5px] leading-relaxed text-slate-600'>
          {note}
        </div>
      ) : null}
    </div>
  );
}
