// Pulse — natural-language company discovery.
//
// v2 rebuild against the Company Profile design language (light header,
// slate tokens, font-display / font-body, edge-to-edge under AppLayout).
// Adds:
//   - Cache-first cascade: query lit_companies before the remote provider,
//     merge results, dedupe on domain. Each result carries vendor-neutral
//     provenance ("In your database" · "Verified" · "Live" · "Discovered").
//   - Quick Card right rail (PulseQuickCard) replaces inline tables for
//     the analyze step. Reuses existing campaign + save flows unchanged.
//   - Enhanced ambient backdrop kept (refined, mono-blue/violet, single
//     soft glow rather than competing accents).
//
// Vendor names (Apollo, Tavily, Hunter, ImportYeti, Lusha, Phantom) are
// not surfaced anywhere in the UI per product direction. Existing
// ImportYeti tables and APIs are NEVER written to from this page.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Compass,
  Database,
  GitBranch,
  Layers,
  MapPin,
  Search,
  Ship,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Wand2,
  X,
} from 'lucide-react';

import { searchPulse, searchPulseV2 } from '@/api/pulse';
import { supabase } from '@/lib/supabase';
import AddToCampaignModal from '@/components/command-center/AddToCampaignModal';
import { saveCompany, isLimitExceeded, LimitExceededError } from '@/lib/saveCompany';
import { CompanyAvatar } from '@/components/CompanyAvatar';
import { extractDomain } from '@/lib/logo';

import {
  classifyPulseError,
  ContactDetailDrawer,
  EmptySetupState,
  ErrorBanner,
  PermissionIssueState,
} from '@/features/pulse/PulseResults';
import { searchLocalCompanies, mergeResults, LOCAL_RICH_THRESHOLD } from '@/features/pulse/pulseLocalSearch';
import PulseQuickCard from '@/features/pulse/PulseQuickCard';
import PulseLibrary from '@/features/pulse/PulseLibrary';
import AddToListPicker from '@/features/pulse/AddToListPicker';
import {
  parsePulseQuery,
  buildLocalFilterRecipe,
} from '@/features/pulse/pulseQueryParser';
import {
  classifyQuery,
  mergeClassification,
} from '@/features/pulse/pulseCoachClassify';
import QueryInterpretation from '@/features/pulse/QueryInterpretation';
import PulseMap from '@/features/pulse/PulseMap';

const PLACEHOLDER_EXAMPLES = [
  'Find marketing directors at SaaS companies in California',
  '50 companies importing automotive parts from Vietnam to Georgia',
  'Mid-sized e-commerce brands shipping out of Los Angeles',
  'Furniture brands in North Carolina with recent growth',
  'Procurement managers at electronics importers',
  'Companies similar to Patagonia',
];

const PROMPT_CATEGORIES = [
  {
    id: 'companies',
    label: 'Discover companies',
    icon: Building2,
    prompts: [
      'AI startups in New York with Series B funding',
      'Furniture brands in North Carolina',
      'Companies similar to Shopify',
    ],
  },
  {
    id: 'contacts',
    label: 'Find decision makers',
    icon: User,
    prompts: [
      'VPs of Supply Chain at retail companies',
      'Marketing directors at D2C brands',
      'Heads of procurement at electronics importers',
    ],
  },
  {
    id: 'trade',
    label: 'Trade & sourcing',
    icon: Ship,
    prompts: [
      '50 companies importing automotive parts from Vietnam to Georgia',
      'Furniture imports from Vietnam in last 90 days',
      'Companies with high TEU growth year over year',
    ],
  },
  {
    id: 'industry',
    label: 'Industry & growth',
    icon: TrendingUp,
    prompts: [
      'Fastest-growing SaaS companies in Texas',
      'Cold-chain logistics providers in the Southeast',
      'E-commerce brands scaling on Shopify',
    ],
  },
];

const EXPLORATIONS = [
  { title: 'What SaaS companies are scaling fastest in Texas?',     tag: 'Industry · Location',     icon: TrendingUp },
  { title: 'Top auto-parts importers from Vietnam into Georgia',    tag: 'Trade · Sourcing',        icon: Ship },
  { title: 'Marketing leaders at D2C brands hiring right now',      tag: 'Contacts · Hiring',       icon: UserPlus },
  { title: 'Companies similar to Patagonia',                        tag: 'Lookalike',               icon: GitBranch },
];

const LOADING_STEPS = [
  'Reading your database…',
  'Interpreting your prompt…',
  'Discovering matching companies…',
  'Ranking results…',
];

const ROLE_RX     = /\b(director|manager|vp|head of|chief|cto|ceo|cfo|founder|lead|officer)\b/i;
const TRADE_RX    = /\b(teu|lane|shipment|import|export|carrier|port|cargo|freight|logistics|sourcing|supplier)\b/i;
const SIMILAR_RX  = /\b(similar to|like)\b/i;
const INDUSTRY_RX = /\b(saas|fintech|ecommerce|e-commerce|retail|logistics|furniture|electronics|apparel|healthcare|consumer|d2c|b2b|startups?)\b/i;

function detectIntent(q) {
  if (!q.trim()) return null;
  const hits = [];
  if (ROLE_RX.test(q))     hits.push('Find decision makers');
  if (TRADE_RX.test(q))    hits.push('Trade & sourcing');
  if (SIMILAR_RX.test(q))  hits.push('Lookalike');
  if (INDUSTRY_RX.test(q)) hits.push('Industry filter');
  if (!hits.length)        hits.push('Company discovery');
  return Array.from(new Set(hits)).slice(0, 3);
}

export default function Pulse() {
  // — search state —
  // Pre-fill from ?q= URL param so Pulse Coach (or any other surface) can
  // deep-link a search. The auto-run effect below kicks the query into
  // runSearch() once auth is ready.
  const initialQuery = (() => {
    if (typeof window === 'undefined') return '';
    const p = new URLSearchParams(window.location.search);
    return (p.get('q') || p.get('query') || '').trim();
  })();
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState([]);
  // Pagination state — `Load more` button appends additional pages to results.
  const [loadingMore, setLoadingMore] = useState(false);
  const [resultMode, setResultMode] = useState(null);
  const [meta, setMeta] = useState(null);
  const [apiStatus, setApiStatus] = useState('unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [localCount, setLocalCount] = useState(0);

  // — selection / actions —
  const [activeCompany, setActiveCompany] = useState(null);
  const [activeContact, setActiveContact] = useState(null);
  const [campaignTarget, setCampaignTarget] = useState(null);
  const [isEnriching, setIsEnriching] = useState(false);
  // Per-contact "Add to List" target — opens the universal AddToListPicker
  // popover (shared with Profile + Campaign builder). Carries the saved
  // contact_id + company_id so the picker can write the membership row.
  const [contactListTarget, setContactListTarget] = useState(null);
  // Coach insight cache, keyed per-company so reopening the Quick Card
  // for the same company returns the cached brief instantly.
  const [insightMap, setInsightMap] = useState({});      // id → { report, generatedAt, cached, plan, limit, used }
  const [insightLoadingId, setInsightLoadingId] = useState(null);
  const [insightErrorMap, setInsightErrorMap] = useState({});  // id → { code, message, used, limit }
  // Bumped after a successful save so PulseLibrary refetches and the
  // user sees the new company appear in their library immediately.
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  // Saved Lists picker state — opened from the Quick Card's "Add to list"
  // action. Carries the resolved lit_companies.id so the picker can
  // write a membership row directly via pulse_list_companies.
  const [listPicker, setListPicker] = useState(null); // { companyId, companyName }

  // — UI flourishes —
  const [phIdx, setPhIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (query) return;
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, [query]);

  const intent = useMemo(() => detectIntent(query), [query]);

  // Coach query parser — two layers:
  //   1. Heuristic runs instantly on every keystroke (debounced 220ms)
  //      so the user gets immediate entity chips
  //   2. LLM classifier fires after a longer pause (700ms) and merges
  //      its richer extraction into the parsed object. Cached 24h
  //      per-query so repeat searches are free.
  const [parsedQuery, setParsedQuery] = useState(() => parsePulseQuery(''));
  const [classifyState, setClassifyState] = useState({ loading: false, error: null });

  useEffect(() => {
    const t = setTimeout(() => setParsedQuery(parsePulseQuery(query)), 220);
    return () => clearTimeout(t);
  }, [query]);

  // v2 owns query parsing — the old pulseCoachClassify pre-flight fire
  // is disabled. The parsed intent comes back inside the pulse-search
  // response (meta.parsed) and is displayed below the search bar.
  useEffect(() => {
    setClassifyState({ loading: false, error: null });
  }, [query]);

  // Auto-run when the page loads with ?q= in the URL (e.g. deep link
  // from Pulse Coach). Fires once on mount.
  const autoRanInitial = useRef(false);
  useEffect(() => {
    if (autoRanInitial.current) return;
    if (!initialQuery) return;
    autoRanInitial.current = true;
    // small delay so auth + state settle before the search fires
    const t = setTimeout(() => {
      runSearch(initialQuery);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const errorClass = useMemo(() => classifyPulseError(errorMessage), [errorMessage]);
  const isSetupError = errorClass === 'setup';
  const isPermissionError = errorClass === 'permission';

  async function runSearch(rawQuery) {
    const trimmed = (rawQuery ?? query).trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setIsSearching(true);
    setErrorMessage('');
    setSearchPerformed(false);
    setActiveCompany(null);

    try {
      // v2 owns search end-to-end: parses, hits saved → directory → Apollo,
      // merges + ranks server-side. Single round trip. No legacy fallback —
      // we surface whatever v2 returns, including empty result sets with
      // the coach_summary explaining what was tried.
      const v2 = await searchPulseV2({ query: trimmed, limit: 50 }).catch(
        (err) => ({ ok: false, error: err?.message || 'pulse_search_failed' }),
      );

      if (v2 && v2.ok && Array.isArray(v2.rows)) {
        setLocalCount(v2.sources?.saved + v2.sources?.directory || 0);
        setResults(v2.rows);
        setResultMode('companies');
        setMeta({
          total: v2.rows.length,
          provider: v2.parser_model || 'pulse-search',
          coach_summary: v2.coach_summary || '',
          sources: v2.sources || null,
          parsed: v2.parsed || null,
          apollo_called: v2.apollo_called || false,
        });
        setApiStatus('connected');
        setSubmittedQuery(trimmed);
        setSearchPerformed(true);
        if (!v2.rows.length) {
          setErrorMessage(v2.coach_summary || 'No matches. Try broadening the geography or rephrasing.');
        }
        return;
      }

      // v2 failed at the function call level (network / CORS / 500 / 401).
      // Surface the actual error to the user so we can diagnose; do NOT
      // silently fall back to legacy results that pretend the query worked.
      setResults([]);
      setResultMode(null);
      setMeta(null);
      setApiStatus('error');
      setSubmittedQuery(trimmed);
      setSearchPerformed(true);
      setErrorMessage(
        (v2 && (v2.error || v2.coach_summary)) ||
          'Pulse search is unreachable right now. Try again in a moment, or contact support if this persists.',
      );
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

  // Save flow — preserved verbatim from prior implementation. Routes
  // through the gated save-company edge fn; ImportYeti tables untouched.
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
        phone: company.phone || null,
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

  // "Save" — quick save to the Pulse Library (All saves view). No
  // picker, no extra clicks. Distinct from "Add to list" which opens
  // the named-list chooser.
  const [saveLibraryPendingId, setSaveLibraryPendingId] = useState(null);
  async function handleSaveToLibrary(company) {
    if (!company) return;
    setSaveLibraryPendingId(company.id || company.name);
    try {
      await upsertCompanyFromResult(company);
      setLibraryRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('[Pulse] save to library failed:', error);
      if (error instanceof LimitExceededError) {
        setErrorMessage(error.message + ' Upgrade at /app/billing.');
      } else {
        setErrorMessage(error?.message || 'Failed to save company.');
      }
    } finally {
      setSaveLibraryPendingId(null);
    }
  }

  // "Add to list" — open the Saved Lists picker. The picker needs a
  // canonical lit_companies.id, so we save the company first (idempotent)
  // and resolve the UUID before showing the chooser.
  async function handleSaveToList(company) {
    try {
      const saved = await upsertCompanyFromResult(company);
      setLibraryRefreshKey((k) => k + 1);
      if (!saved?.id) {
        setErrorMessage('Saved, but could not resolve a database id for the lists picker.');
        return;
      }
      setListPicker({ companyId: saved.id, companyName: saved.name || company.name });
    } catch (error) {
      console.error('[Pulse] save failed:', error);
      if (error instanceof LimitExceededError) {
        setErrorMessage(error.message + ' Upgrade at /app/billing.');
      } else {
        setErrorMessage(error?.message || 'Failed to save company.');
      }
    }
  }

  // "Add to Campaign" for an Apollo decision-maker contact discovered
  // inside the Quick Card. Saves the parent company first (so the FK
  // resolves), persists the contact to lit_contacts, then opens the
  // existing campaign picker.
  async function handleAddContactToCampaign(contact) {
    if (!contact) return;
    setErrorMessage('');
    try {
      const company = activeCompany;
      if (!company) throw new Error('No active company.');
      const saved = await upsertCompanyFromResult(company);
      if (!saved?.id) throw new Error('Failed to save parent company.');

      try {
        // Column names must match the lit_contacts schema exactly.
        // Earlier rev wrote `dept` / `linkedin` / `verified` which are
        // not columns on the table — PostgREST returned 400 and the
        // try/catch swallowed it, so contacts added via "Add to
        // Campaign" from Pulse never persisted.
        const fullName =
          contact.full_name ||
          [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
          contact.name ||
          null;
        await supabase.from('lit_contacts').insert({
          company_id: saved.id,
          full_name: fullName,
          first_name: contact.first_name || null,
          last_name: contact.last_name || null,
          title: contact.title || null,
          department: contact.department || null,
          email: contact.email || null,
          phone: contact.phone || null,
          linkedin_url: contact.linkedin_url || null,
          source: 'pulse',
          verified_by_provider: Boolean(contact.email || contact.phone),
        });
      } catch (contactErr) {
        console.warn('[Pulse] save decision-maker contact failed:', contactErr);
      }

      setLibraryRefreshKey((k) => k + 1);
      setCampaignTarget({ company_id: saved.id, name: saved.name || company.name });
    } catch (error) {
      console.error('[Pulse] add contact to campaign failed:', error);
      if (error instanceof LimitExceededError) {
        setErrorMessage(error.message + ' Upgrade at /app/billing.');
      } else {
        setErrorMessage(error?.message || 'Failed to add contact to campaign.');
      }
    }
  }

  // "Add to List" for a discovered Apollo contact. Mirrors
  // handleAddContactToCampaign — saves the parent company first,
  // upserts the contact (so the picker has a real contact_id to bind),
  // then opens the universal AddToListPicker keyed to that contact.
  async function handleAddContactToList(contact) {
    if (!contact) return;
    setErrorMessage('');
    try {
      const company = activeCompany;
      if (!company) throw new Error('No active company.');
      const saved = await upsertCompanyFromResult(company);
      if (!saved?.id) throw new Error('Failed to save parent company.');

      const fullName =
        contact.full_name ||
        [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
        contact.name ||
        null;
      // Insert + return so we have the lit_contacts.id to pass to the picker.
      const { data: inserted, error: insertErr } = await supabase
        .from('lit_contacts')
        .insert({
          company_id: saved.id,
          full_name: fullName,
          first_name: contact.first_name || null,
          last_name: contact.last_name || null,
          title: contact.title || null,
          department: contact.department || null,
          email: contact.email || null,
          phone: contact.phone || null,
          linkedin_url: contact.linkedin_url || null,
          source: 'pulse',
          verified_by_provider: Boolean(contact.email || contact.phone),
        })
        .select('id')
        .single();
      if (insertErr) {
        console.warn('[Pulse] save contact for list-add failed:', insertErr);
      }
      setLibraryRefreshKey((k) => k + 1);
      setContactListTarget({
        contactId: inserted?.id ?? null,
        contactName: fullName || 'Contact',
        companyId: saved.id,
      });
    } catch (error) {
      console.error('[Pulse] add contact to list failed:', error);
      if (error instanceof LimitExceededError) {
        setErrorMessage(error.message + ' Upgrade at /app/billing.');
      } else {
        setErrorMessage(error?.message || 'Failed to add contact to list.');
      }
    }
  }

  async function handleAddToCampaign(company) {
    setErrorMessage('');
    try {
      const saved = await upsertCompanyFromResult(company);
      if (!saved?.id) throw new Error('Failed to save company before campaign assignment.');
      setLibraryRefreshKey((k) => k + 1);
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

  function handleOpenInSearch(company) {
    const name = company?.name || '';
    if (!name) return;
    window.location.href = `/app/search?q=${encodeURIComponent(name)}`;
  }

  // Coach insight handler — invokes the existing pulse-ai-enrich edge fn
  // (the same one Company Profile uses). For "discovered" rows that aren't
  // in lit_companies yet we save first so the function has a row to load
  // context against. Per-company cache so re-opening the Quick Card returns
  // the brief instantly without burning quota.
  async function handleGenerateInsight(company, { force = false } = {}) {
    if (!company) return;
    const cacheKey = company.id || company.business_id || company.domain || company.name;
    if (!force && insightMap[cacheKey]) return; // already loaded
    if (insightLoadingId === cacheKey) return;

    setInsightLoadingId(cacheKey);
    setInsightErrorMap((m) => ({ ...m, [cacheKey]: null }));

    try {
      // Resolve a target the edge fn understands. Prefer source_company_key
      // (no DB lookup needed) when the row is "discovered" / not yet saved.
      let companyId = isUuid(company.id) ? company.id : null;
      let sourceKey = company.business_id || company.source_company_key || null;

      // If the company isn't in our database yet, save it first so the
      // edge fn can hydrate verified context. This matches how Company
      // Profile uses pulse-ai-enrich (it expects a lit_companies row).
      const inDb = company.provenance === 'database' || company.alsoLive;
      if (!inDb && !companyId) {
        try {
          const saved = await upsertCompanyFromResult(company);
          if (saved?.id) {
            companyId = saved.id;
            sourceKey = saved.source_company_key || sourceKey;
            setLibraryRefreshKey((k) => k + 1);
          }
        } catch (saveErr) {
          if (saveErr instanceof LimitExceededError) {
            setInsightErrorMap((m) => ({
              ...m,
              [cacheKey]: {
                code: 'LIMIT_EXCEEDED',
                message: saveErr.message + ' Upgrade at /app/billing.',
              },
            }));
            setInsightLoadingId(null);
            return;
          }
          throw saveErr;
        }
      }

      if (!companyId && !sourceKey) {
        setInsightErrorMap((m) => ({
          ...m,
          [cacheKey]: {
            code: 'MISSING_IDENTIFIER',
            message: 'Could not identify this company to generate an insight.',
          },
        }));
        setInsightLoadingId(null);
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke('pulse-ai-enrich', {
        body: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(sourceKey ? { source_company_key: sourceKey } : {}),
          mode: 'pulse_page',
          force_refresh: force,
        },
      });

      // supabase-js wraps non-2xx in FunctionsHttpError; pull the structured
      // body out so we render the real error code (LIMIT_EXCEEDED etc.)
      let parsedErr = null;
      if (invokeError) {
        try {
          const ctx = invokeError?.context;
          const cloned = ctx?.clone?.();
          parsedErr = await cloned?.json?.();
        } catch {
          parsedErr = null;
        }
      }
      const effective = parsedErr || data;

      if (invokeError && !parsedErr) throw invokeError;

      if (!effective?.ok) {
        const code = effective?.code || 'PULSE_AI_FAILED';
        const friendly =
          effective?.message ||
          (code === 'LIMIT_EXCEEDED'
            ? "You've reached your Coach insight limit for this billing period."
            : code === 'COMPANY_NOT_FOUND'
              ? "We couldn't find this company in the database."
              : 'Coach insight failed. Try again in a moment.');
        setInsightErrorMap((m) => ({
          ...m,
          [cacheKey]: {
            code,
            message: friendly,
            used: effective?.used,
            limit: effective?.limit,
          },
        }));
      } else {
        const report = data.report || {};
        const reportRow = data.report_row || {};
        setInsightMap((m) => ({
          ...m,
          [cacheKey]: {
            report,
            generatedAt: reportRow.generated_at || report.generated_at || null,
            cached: Boolean(data.cached),
            plan: data.plan ?? null,
            used: data.used ?? null,
            limit: data.limit ?? null,
            confidence:
              report.confidence_score ?? report.confidence ?? reportRow.confidence ?? null,
            companyId,
            sourceKey,
          },
        }));
      }
    } catch (err) {
      console.error('[Pulse] coach insight failed:', err);
      setInsightErrorMap((m) => ({
        ...m,
        [cacheKey]: {
          code: 'NETWORK',
          message: err?.message || 'Coach insight network error.',
        },
      }));
    } finally {
      setInsightLoadingId(null);
    }
  }

  function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
  }

  // Build a human-readable summary of what the search actually tried,
  // so the empty-state can name the parsed entities back to the user
  // ("automotive parts importers in Georgia, US") instead of saying
  // "no matches" with no context.
  function describeAttempt(parsed, recipe) {
    if (!parsed?.hasAny) return null;
    const bits = [];
    if (parsed.products.length) bits.push(parsed.products.slice(0, 2).join(' / '));
    else if (parsed.industries.length) bits.push(parsed.industries.slice(0, 2).join(' / '));
    if (parsed.direction === 'import') bits.push('importers');
    else if (parsed.direction === 'export') bits.push('exporters');
    else if (parsed.direction === 'ship') bits.push('shippers');
    if (parsed.destinations.length) {
      bits.push(`in ${parsed.destinations.map((d) => d.name).join(', ')}`);
    } else if (recipe?.states?.length) {
      bits.push(`in ${recipe.states.join(', ')}`);
    }
    if (parsed.origins.length) {
      bits.push(`sourcing from ${parsed.origins.map((o) => o.name).join(', ')}`);
    }
    return bits.length ? bits.join(' ') : null;
  }

  async function enrichContact(contact) {
    if (!contact) return;
    setIsEnriching(true);
    setErrorMessage('');
    try {
      // The old `searchLeads { action: 'enrich_contact' }` path was a
      // server-side stub that returned "not implemented" — Pulse-side
      // enrichment has been silently no-oping. Route through the same
      // edge function the Profile page uses (apollo-contact-enrich), so
      // enrichment hits Apollo, persists to lit_contacts, AND auto-saves
      // the parent company so the contact lands under
      // /app/contacts → Saved Companies → Contacts.
      const company = activeCompany || {};
      const targetCompanyId =
        company.company_id ||
        company.id ||
        company.uuid ||
        null;
      const targetDomain =
        company.domain ||
        company.website ||
        contact.organization_domain ||
        null;
      const targetCompanyName =
        company.name ||
        company.company_name ||
        contact.organization_name ||
        null;

      const target = {
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        full_name: contact.full_name || contact.name || null,
        name: contact.full_name || contact.name || null,
        title: contact.title || null,
        email: contact.email || null,
        linkedin_url: contact.linkedin_url || null,
        domain: targetDomain,
        organization_name: targetCompanyName,
        apollo_person_id: contact.apollo_person_id || contact.prospect_id || null,
      };

      const { data, error } = await supabase.functions.invoke(
        'apollo-contact-enrich',
        {
          body: {
            contacts: [target],
            ...(targetCompanyId ? { company_id: targetCompanyId } : {}),
            ...(targetDomain ? { domain: targetDomain } : {}),
            ...(targetCompanyName ? { company_name: targetCompanyName } : {}),
            reveal_personal_emails: true,
            reveal_phone_number: true,
          },
        },
      );
      if (error) throw error;
      if (data && data.ok === false) {
        throw new Error(data.error || data.message || 'Enrichment failed.');
      }
      const enriched =
        data?.contacts?.[0] ||
        data?.contact ||
        data?.results?.[0] ||
        {};
      setActiveContact({
        ...contact,
        email: enriched.email || contact.email,
        phone: enriched.phone || contact.phone,
        linkedin_url: enriched.linkedin_url || contact.linkedin_url,
        title: enriched.title || contact.title,
        full_name:
          enriched.full_name ||
          contact.full_name ||
          [enriched.first_name, enriched.last_name].filter(Boolean).join(' ') ||
          contact.name,
      });
    } catch (error) {
      console.error('[Pulse] enrich contact failed:', error);
      setErrorMessage(error?.message || 'Failed to enrich contact.');
    } finally {
      setIsEnriching(false);
    }
  }

  const resultCount = results.length;

  return (
    <div className="relative -mx-[10px] -my-4 flex min-h-[calc(100vh-120px)] flex-col overflow-x-hidden bg-[#F8FAFC]">
      {/* Refined ambient backdrop — single soft blue/violet glow.
          Sized smaller than v1, anchored to the top so it frames the
          hero rather than washing the whole canvas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 z-0 h-[520px] w-[1100px] -translate-x-1/2 blur-2xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.10) 35%, rgba(139,92,246,0.06) 60%, transparent 78%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-120px] top-[140px] z-0 h-[360px] w-[480px] blur-3xl"
        style={{
          background:
            'radial-gradient(circle at center, rgba(59,130,246,0.08), transparent 70%)',
        }}
      />

      {/* Page chrome — light header, mirrors Company Profile */}
      <header className="relative z-10 shrink-0 border-b border-slate-200 bg-white/85 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-6 pt-3">
          <div className="font-body flex items-center gap-1.5 text-[12px] text-slate-500">
            <Compass className="h-3 w-3 text-slate-400" />
            <span>Pulse</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">Discover companies</span>
          </div>
          <div className="font-mono flex items-center gap-2 whitespace-nowrap text-[11px] text-slate-400">
            {searchPerformed && apiStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Live
              </span>
            ) : null}
            {searchPerformed ? (
              <span>
                {resultCount} result{resultCount === 1 ? '' : 's'}
                {localCount > 0
                  ? ` · ${localCount} from your shipment database · ${Math.max(0, resultCount - localCount)} prospect${(resultCount - localCount) === 1 ? '' : 's'}`
                  : ` · 0 in your shipment database (showing prospects only)`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-3.5 px-6 pb-4 pt-3">
          <div
            className="font-display relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md text-white"
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              boxShadow: '0 4px 14px rgba(0,240,255,0.18), 0 1px 3px rgba(15,23,42,0.25)',
            }}
            aria-hidden
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(circle at 30% 30%, rgba(0,240,255,0.32), transparent 65%)' }}
            />
            <Sparkles className="relative h-5 w-5" style={{ color: '#00F0FF' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display m-0 text-[22px] font-bold leading-tight tracking-tight text-slate-900">
              Ask anything about any company, contact, or market.
            </h1>
            <p className="font-body mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-slate-600">
              One natural-language search across your saved companies, freight intelligence, and live
              discovery. Pulse reads what you already own first, so you never burn credits on data
              you have.
            </p>
          </div>
        </div>
      </header>

      {/* Body — wrapped in a centered max-width to match Dashboard's 1500px */}
      <div className="relative z-10 mx-auto w-full max-w-[1500px] flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        {/* Hero search card */}
        <div className="rounded-[14px] border border-slate-200 bg-white p-2.5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-2 px-1.5 py-1">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder={PLACEHOLDER_EXAMPLES[phIdx]}
              className="font-body flex-1 border-0 bg-transparent py-1.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
            />
            {query ? (
              <button
                type="button"
                onClick={() => { setQuery(''); setSubmittedQuery(''); setSearchPerformed(false); setResults([]); setMeta(null); }}
                aria-label="Clear search"
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => runSearch()}
              disabled={isSearching || !query.trim()}
              className="font-display inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? <Sparkles className="h-3 w-3 animate-pulse" /> : <ArrowRight className="h-3 w-3" />}
              Ask Pulse
            </button>
          </div>

          {/* Intent strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-1.5 pb-1 pt-2">
            <div className="font-display inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              <Wand2 className="h-2.5 w-2.5" />
              Reading as
            </div>
            {intent ? (
              intent.map((label) => (
                <span
                  key={label}
                  className="font-display rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                >
                  {label}
                </span>
              ))
            ) : (
              <span className="font-body rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">
                — start typing —
              </span>
            )}
          </div>
        </div>

        {/* v2 parsed-intent chips — shown after a search completes. Replaces
            the legacy QueryInterpretation chip block which read from the
            client-side parser (now disabled). */}
        {searchPerformed && meta?.parsed ? (
          <V2IntentChips parsed={meta.parsed} sources={meta.sources} apolloCalled={meta.apollo_called} />
        ) : null}

        {/* Globe — only renders when the parser found freight endpoints */}
        <PulseMap parsed={parsedQuery} results={results} />

        {/* Prompt category gallery — idle only */}
        {!searchPerformed && !isSearching ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PROMPT_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.id}
                  className="rounded-[14px] border border-slate-200 bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]"
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                      <Icon className="h-3 w-3" />
                    </div>
                    <span className="font-display text-[12px] font-bold tracking-tight text-slate-900">
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {cat.prompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => runSearch(p)}
                        className="font-body rounded-md border border-slate-100 bg-[#F8FAFC] px-2 py-1.5 text-left text-[11.5px] leading-snug text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900"
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

        {/* Empty / explore */}
        {!isSearching && !searchPerformed ? <ExploreState onPick={runSearch} /> : null}

        {/* Errors */}
        {searchPerformed && !isSearching && errorMessage && !isSetupError && !isPermissionError ? (
          <div className="mt-4">
            <ErrorBanner message={errorMessage} />
          </div>
        ) : null}
        {searchPerformed && !isSearching && isPermissionError ? (
          <div className="mt-4">
            <PermissionIssueState message={errorMessage} />
          </div>
        ) : null}
        {searchPerformed && !isSearching && isSetupError ? (
          <div className="mt-4">
            <EmptySetupState message={errorMessage} />
          </div>
        ) : null}

        {/* Results grid */}
        {searchPerformed && !isSearching && !isSetupError && !isPermissionError && results.length > 0 ? (
          <div className="mt-5">
            <ResultsHeader
              query={submittedQuery}
              total={resultCount}
              local={localCount}
              mode={resultMode}
            />
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {results.map((c) => (
                <ResultCard
                  key={c.id}
                  company={c}
                  active={activeCompany?.id === c.id}
                  onClick={() => setActiveCompany(c)}
                />
              ))}
            </div>
            {/* Pagination — page size is 50; show "Load more" when the
                upstream meta reports a higher total than what's
                rendered. Each click fires page+1 via searchPulse and
                appends the new rows to results. Local-only result sets
                cap at 50 (the lit_company_directory cascade already
                returns its full match window in one query) so the
                button hides when remoteRows didn't contribute. */}
            {(() => {
              const total = Number(meta?.total) || 0;
              const pageSize = Number(meta?.pageSize) || 50;
              const currentPage = Number(meta?.page) || 1;
              const hasMore = total > resultCount && total > currentPage * pageSize;
              if (!hasMore) return null;
              return (
                <div className="mt-4 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={async () => {
                      if (loadingMore) return;
                      setLoadingMore(true);
                      try {
                        const nextPage = currentPage + 1;
                        const nextResp = await searchPulse({
                          query: submittedQuery,
                          ui_mode: 'auto',
                          entities: parsedQuery?.hasAny ? parsedQuery : undefined,
                          page: nextPage,
                        }).catch(() => null);
                        const moreRows = Array.isArray(nextResp?.data?.results)
                          ? nextResp.data.results
                          : [];
                        if (moreRows.length > 0) {
                          setResults((prev) => [...prev, ...moreRows]);
                          if (nextResp?.meta) setMeta(nextResp.meta);
                        }
                      } finally {
                        setLoadingMore(false);
                      }
                    }}
                    disabled={loadingMore}
                    className="font-display rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {loadingMore
                      ? 'Loading…'
                      : `Load more · showing ${resultCount} of ${total}`}
                  </button>
                </div>
              );
            })()}
          </div>
        ) : null}

        {/* Pulse Library — collapsible, scoped to source='pulse' */}
        <PulseLibrary onSelect={setActiveCompany} refreshKey={libraryRefreshKey} />
      </div>

      {/* Quick Card right rail */}
      <PulseQuickCard
        company={activeCompany}
        open={Boolean(activeCompany)}
        onClose={() => setActiveCompany(null)}
        onOpenInSearch={handleOpenInSearch}
        onAddToCampaign={handleAddToCampaign}
        onSaveToLibrary={handleSaveToLibrary}
        onSaveToList={handleSaveToList}
        onAddContactToCampaign={handleAddContactToCampaign}
        onAddContactToList={handleAddContactToList}
        onGenerateInsight={handleGenerateInsight}
        saveToLibraryPending={saveLibraryPendingId === (activeCompany?.id || activeCompany?.name)}
        isInDatabase={activeCompany?.provenance === 'database' || activeCompany?.alsoLive}
        insight={(() => {
          if (!activeCompany) return null;
          const k = activeCompany.id || activeCompany.business_id || activeCompany.domain || activeCompany.name;
          return insightMap[k] || null;
        })()}
        insightLoading={(() => {
          if (!activeCompany) return false;
          const k = activeCompany.id || activeCompany.business_id || activeCompany.domain || activeCompany.name;
          return insightLoadingId === k;
        })()}
        insightError={(() => {
          if (!activeCompany) return null;
          const k = activeCompany.id || activeCompany.business_id || activeCompany.domain || activeCompany.name;
          return insightErrorMap[k] || null;
        })()}
      />

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
      <AddToListPicker
        open={Boolean(listPicker)}
        onClose={() => setListPicker(null)}
        companyId={listPicker?.companyId || null}
        companyName={listPicker?.companyName || ''}
        contextQuery={submittedQuery || query || null}
        onSaved={() => setLibraryRefreshKey((k) => k + 1)}
      />
      {/* Per-contact "Add to List" — uses the same picker, but bound to
          the contact_id from lit_contacts so it inserts the membership
          row into pulse_list_contacts (not pulse_list_companies). */}
      <AddToListPicker
        open={Boolean(contactListTarget)}
        onClose={() => setContactListTarget(null)}
        contactId={contactListTarget?.contactId || null}
        contactName={contactListTarget?.contactName || ''}
        companyId={contactListTarget?.companyId || null}
        contextQuery={submittedQuery || query || null}
        onSaved={() => setLibraryRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

/* ─────────── Sub-components ─────────── */

function V2IntentChips({ parsed, sources, apolloCalled }) {
  if (!parsed) return null;
  const audience = Array.isArray(parsed.audience_type) ? parsed.audience_type : [];
  const industry = Array.isArray(parsed.industry_terms) ? parsed.industry_terms : [];
  const states = parsed.geo?.states || [];
  const cities = parsed.geo?.cities || [];
  const region = parsed.geo?.region;
  const sizeMin = parsed.size?.employee_min;
  const sizeMax = parsed.size?.employee_max;
  const chips = [];
  for (const a of audience.slice(0, 4)) chips.push({ key: `aud-${a}`, label: a.replace(/_/g, ' '), tone: 'cyan' });
  for (const t of industry.slice(0, 3)) chips.push({ key: `ind-${t}`, label: t, tone: 'violet' });
  if (region) chips.push({ key: `reg-${region}`, label: region, tone: 'green' });
  for (const s of states.slice(0, 3)) chips.push({ key: `st-${s}`, label: s, tone: 'green' });
  for (const c of cities.slice(0, 2)) chips.push({ key: `ci-${c}`, label: c, tone: 'green' });
  if (sizeMin != null || sizeMax != null) chips.push({ key: 'size', label: `${sizeMin ?? 1}–${sizeMax ?? '∞'} employees`, tone: 'amber' });
  if (chips.length === 0) return null;
  const total = (sources?.saved || 0) + (sources?.directory || 0) + (sources?.apollo || 0);
  return (
    <div className="mt-3 rounded-xl border border-slate-800/40 bg-gradient-to-r from-[#0F172A] to-[#1E293B] p-3 text-slate-100">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-300">
        <span>Pulse understood</span>
        <span className="text-slate-400 normal-case font-normal tracking-normal">
          {sources?.saved ? `${sources.saved} saved · ` : ''}
          {sources?.directory ? `${sources.directory} LIT · ` : ''}
          {sources?.apollo ? `${sources.apollo} Apollo · ` : ''}
          total {total}
          {apolloCalled ? '' : ' · Apollo not called'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.key}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background:
                c.tone === 'cyan' ? 'rgba(34,211,238,0.15)' :
                c.tone === 'violet' ? 'rgba(167,139,250,0.18)' :
                c.tone === 'green' ? 'rgba(74,222,128,0.18)' :
                c.tone === 'amber' ? 'rgba(251,191,36,0.18)' : 'rgba(148,163,184,0.18)',
              color:
                c.tone === 'cyan' ? '#67e8f9' :
                c.tone === 'violet' ? '#c4b5fd' :
                c.tone === 'green' ? '#86efac' :
                c.tone === 'amber' ? '#fcd34d' : '#cbd5e1',
              border: `1px solid ${
                c.tone === 'cyan' ? 'rgba(34,211,238,0.3)' :
                c.tone === 'violet' ? 'rgba(167,139,250,0.3)' :
                c.tone === 'green' ? 'rgba(74,222,128,0.3)' :
                c.tone === 'amber' ? 'rgba(251,191,36,0.3)' : 'rgba(148,163,184,0.3)'
              }`,
            }}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PulseLoading() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => Math.min(a + 1, LOADING_STEPS.length - 1)), 280);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="relative mt-5 overflow-hidden rounded-[14px] border px-5 py-4"
      style={{
        background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #102240 100%)',
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 8px 30px rgba(15,23,42,0.18)',
      }}
    >
      {/* Cyan halo to align with Pulse Coach branding */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.22), transparent 70%)' }}
      />
      <div className="relative mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md border"
          style={{ background: 'rgba(0,240,255,0.12)', borderColor: 'rgba(0,240,255,0.35)' }}
        >
          <Sparkles className="h-3 w-3" style={{ color: '#00F0FF' }} />
        </div>
        <div
          className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em]"
          style={{ color: '#00F0FF' }}
        >
          Pulse Coach is searching
        </div>
      </div>
      <div className="relative flex flex-col gap-2">
        {LOADING_STEPS.map((s, i) => {
          const done = i < active;
          const now = i === active;
          return (
            <div key={s} className="flex items-center gap-2.5" style={{ opacity: i > active ? 0.4 : 1 }}>
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                {done ? <CheckCircle2 className="h-2.5 w-2.5" style={{ color: '#00F0FF' }} /> : null}
                {now ? (
                  <span
                    className="h-2 w-2 animate-spin rounded-full border-[1.5px]"
                    style={{ borderColor: 'rgba(0,240,255,0.2)', borderTopColor: '#00F0FF' }}
                  />
                ) : null}
                {!done && !now ? (
                  <span className="h-1 w-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
                ) : null}
              </div>
              <span
                className={[
                  'font-body text-[12.5px]',
                  done ? 'font-medium text-slate-400' : now ? 'font-semibold text-slate-100' : 'font-medium text-slate-500',
                ].join(' ')}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExploreState({ onPick }) {
  return (
    <div className="mt-5 rounded-[14px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-50 to-violet-50">
          <Compass className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <div>
          <div className="font-display text-[13px] font-bold text-slate-900">Start with an exploration</div>
          <div className="font-body mt-0.5 text-[11.5px] text-slate-500">
            Pulse works best when you describe what you're looking for — not just keywords.
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {EXPLORATIONS.map((e) => {
          const Icon = e.icon;
          return (
            <button
              key={e.title}
              type="button"
              onClick={() => onPick(e.title)}
              className="flex items-center gap-2.5 rounded-md border border-slate-100 bg-[#F8FAFC] px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50">
                <Icon className="h-3 w-3 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[12.5px] font-semibold text-slate-900">{e.title}</div>
                <div className="font-display mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {e.tag}
                </div>
              </div>
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultsHeader({ query, total, local, mode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <span className="font-body text-[12px] text-slate-500">
        Results for{' '}
        <span className="font-display font-semibold text-slate-900">“{query}”</span>
      </span>
      {local > 0 ? (
        <span className="font-display inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">
          <Database className="h-2.5 w-2.5" />
          {local} from your database
        </span>
      ) : null}
      <span className="ml-auto font-mono text-[11px] text-slate-400">
        {total} total · mode {mode || 'companies'}
      </span>
    </div>
  );
}

function ResultCard({ company, active, onClick }) {
  const domain = extractDomain(company.domain || company.website) || company.domain || stripUrl(company.website);
  const location = [company.city, company.state, company.country].filter(Boolean).join(', ');
  const inDb = company.provenance === 'database' || company.alsoLive;
  const shipments = company.kpis?.shipments_12m;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex flex-col gap-2 rounded-[14px] border bg-white p-3.5 text-left transition',
        active
          ? 'border-blue-400 shadow-[0_8px_24px_rgba(59,130,246,0.18)]'
          : 'border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)]',
      ].join(' ')}
    >
      {/* identity */}
      <div className="flex items-start gap-2.5">
        <CompanyAvatar
          name={company.name || 'Unknown'}
          domain={domain || null}
          size="sm"
          className="!h-9 !w-9 !rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[13.5px] font-bold leading-tight text-slate-900">
            {company.name}
          </div>
          <div className="font-body mt-0.5 truncate text-[11px] text-slate-500">
            {domain || 'No domain'}
            {location ? ` · ${location}` : ''}
          </div>
        </div>
      </div>

      {/* signal pills */}
      <div className="flex flex-wrap items-center gap-1">
        {inDb ? (
          <ProvenancePill tone="blue" icon={Database}>
            In database
          </ProvenancePill>
        ) : (
          <ProvenancePill tone="amber" icon={Sparkles}>
            Discovered
          </ProvenancePill>
        )}
        {shipments != null && shipments > 0 ? (
          <ProvenancePill tone="slate" icon={Ship}>
            {Number(shipments).toLocaleString()} shipments
          </ProvenancePill>
        ) : null}
        {company.industry ? (
          <ProvenancePill tone="slate" icon={Layers}>
            {company.industry}
          </ProvenancePill>
        ) : null}
      </div>

      {/* footer cta */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Click to analyze
        </span>
        <span className="font-display inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 group-hover:text-blue-700">
          Open card
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function ProvenancePill({ tone, icon: Icon, children }) {
  const map = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span
      className={[
        'font-display inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
        map[tone] || map.slate,
      ].join(' ')}
    >
      <Icon className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}

function stripUrl(url) {
  if (!url) return '';
  return String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '').split('/')[0];
}
