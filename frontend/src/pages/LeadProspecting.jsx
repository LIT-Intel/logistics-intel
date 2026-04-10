import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Mail,
  Phone,
  Search,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Company, Contact } from '@/api/entities';
import { useAuth } from '@/auth/AuthProvider';
import { searchPulse } from '@/api/pulse';

const PROMPT_CHIPS = [
  'Find logistics companies in Georgia with over $1B in revenue',
  'Find VPs of Sales at freight forwarders in Atlanta',
  'Show importers in Texas with 200 to 1000 employees',
  'Find procurement directors at manufacturers in Tennessee',
  'Build a list of 3PLs in Chicago and the operations leaders at each one',
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

function ModeToggle({ value, onChange }) {
  const items = [
    { id: 'auto', label: 'Auto', icon: Sparkles },
    { id: 'companies', label: 'Companies', icon: Building2 },
    { id: 'people', label: 'People', icon: UserRound },
  ];

  return (
    <div className='inline-flex rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur'>
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;

        return (
          <button
            key={item.id}
            type='button'
            onClick={() => onChange(item.id)}
            className={[
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
              active
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            ].join(' ')}
          >
            <Icon className='h-4 w-4' />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CompanyContactsPreview({ contacts = [] }) {
  if (!contacts.length) return null;

  return (
    <div className='mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
      <div className='mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>
        Contact preview
      </div>

      <div className='grid gap-3 md:grid-cols-2'>
        {contacts.slice(0, 6).map((contact) => (
          <div key={contact.id} className='rounded-2xl bg-white p-3 shadow-sm'>
            <div className='text-sm font-semibold text-slate-900'>
              {contact.full_name || contact.name || 'Unknown Contact'}
            </div>
            <div className='mt-1 text-sm text-slate-500'>
              {contact.title || contact.department || 'Contact'}
            </div>

            <div className='mt-3 flex flex-wrap gap-2 text-xs'>
              {contact.email ? (
                <span className='inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 font-medium text-cyan-700'>
                  <Mail className='h-3 w-3' />
                  {contact.email}
                </span>
              ) : null}

              {contact.phone ? (
                <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700'>
                  <Phone className='h-3 w-3' />
                  {contact.phone}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyCard({ company, selected, onSelect, expanded, onToggleExpand }) {
  return (
    <div className='rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)]'>
      <div className='flex items-start justify-between gap-4'>
        <div className='flex items-start gap-4'>
          <Checkbox checked={selected} onCheckedChange={onSelect} />
          <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100'>
            <Building2 className='h-5 w-5 text-slate-500' />
          </div>

          <div>
            <div className='flex items-center gap-2'>
              <h3 className='text-base font-semibold text-slate-950'>{company.name}</h3>
              {company.domain ? (
                <a
                  href={company.domain.startsWith('http') ? company.domain : `https://${company.domain}`}
                  target='_blank'
                  rel='noreferrer'
                  className='text-slate-400 hover:text-slate-600'
                >
                  <ExternalLink className='h-4 w-4' />
                </a>
              ) : null}
            </div>

            <p className='mt-1 text-sm text-slate-500'>
              {[company.city, company.state, company.country].filter(Boolean).join(', ') || 'Location unavailable'}
            </p>

            <div className='mt-3 flex flex-wrap gap-2'>
              {company.industry ? (
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                  {company.industry}
                </span>
              ) : null}
              {company.employee_count ? (
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                  {company.employee_count} employees
                </span>
              ) : null}
              {company.annual_revenue ? (
                <span className='rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700'>
                  {company.annual_revenue} revenue
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className='flex flex-col items-end gap-2'>
          <div className='text-right text-sm text-slate-500'>
            <div className='font-semibold text-slate-900'>
              {company.contacts_count || company.contacts?.length || 0}
            </div>
            <div>contacts</div>
          </div>

          {(company.contacts?.length || company.contacts_count) ? (
            <button
              type='button'
              onClick={onToggleExpand}
              className='inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50'
            >
              {expanded ? <ChevronUp className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
              Reveal contacts
            </button>
          ) : null}
        </div>
      </div>

      {company.summary ? (
        <p className='mt-4 text-sm leading-6 text-slate-600'>{company.summary}</p>
      ) : null}

      {expanded ? <CompanyContactsPreview contacts={company.contacts || []} /> : null}
    </div>
  );
}

function PeopleCard({ person, selected, onSelect }) {
  return (
    <div className='rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)]'>
      <div className='flex items-start gap-4'>
        <Checkbox checked={selected} onCheckedChange={onSelect} />

        <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100'>
          <UserRound className='h-5 w-5 text-slate-500' />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='text-base font-semibold text-slate-950'>
              {person.full_name || 'Unknown Person'}
            </h3>

            {person.linkedin_url ? (
              <a
                href={person.linkedin_url}
                target='_blank'
                rel='noreferrer'
                className='text-slate-400 hover:text-slate-600'
              >
                <ExternalLink className='h-4 w-4' />
              </a>
            ) : null}
          </div>

          <p className='mt-1 text-sm text-slate-600'>
            {[person.title, person.company?.name].filter(Boolean).join(' • ') || 'No title available'}
          </p>

          <p className='mt-1 text-sm text-slate-500'>
            {[person.company?.city, person.company?.state, person.company?.country]
              .filter(Boolean)
              .join(', ') || 'Location unavailable'}
          </p>

          <div className='mt-3 flex flex-wrap gap-2'>
            {person.department ? (
              <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                {person.department}
              </span>
            ) : null}
            {person.seniority ? (
              <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'>
                {person.seniority}
              </span>
            ) : null}
            {person.company?.industry ? (
              <span className='rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700'>
                {person.company.industry}
              </span>
            ) : null}
          </div>

          <div className='mt-4 flex flex-wrap gap-2 text-xs'>
            {person.email ? (
              <span className='inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 font-medium text-cyan-700'>
                <Mail className='h-3 w-3' />
                {person.email}
              </span>
            ) : null}

            {person.phone ? (
              <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700'>
                <Phone className='h-3 w-3' />
                {person.phone}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeadProspecting() {
  const { user } = useAuth();

  const [uiMode, setUiMode] = useState('auto');
  const [query, setQuery] = useState('');
  const [resultMode, setResultMode] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedCompanies, setExpandedCompanies] = useState(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [meta, setMeta] = useState(null);
  const [apiStatus, setApiStatus] = useState('unknown');

  const isPeopleMode = resultMode === 'people';
  const isCompanyMode = resultMode === 'companies' || resultMode === 'hybrid_people_over_company';

  const statusPill = useMemo(() => {
    if (apiStatus === 'connected') {
      return (
        <span className='inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700'>
          <span className='h-1.5 w-1.5 rounded-full bg-green-500' />
          Live API
        </span>
      );
    }

    if (apiStatus === 'error') {
      return (
        <span className='inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700'>
          <span className='h-1.5 w-1.5 rounded-full bg-rose-500' />
          API Error
        </span>
      );
    }

    return (
      <span className='inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600'>
        <span className='h-1.5 w-1.5 rounded-full bg-slate-400' />
        Not Verified
      </span>
    );
  }, [apiStatus]);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setErrorMessage('');
    setSearchPerformed(false);
    setSelectedIds([]);
    setExpandedCompanies(new Set());

    try {
      const response = await searchPulse({
        query: trimmed,
        ui_mode: uiMode,
      });

      setApiStatus(response?.ok ? 'connected' : 'error');
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
            : 'No companies matched this search. Try widening geography, lowering thresholds, or simplifying the prompt.'
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

  async function importSelected() {
    if (!selectedIds.length) return;

    setIsImporting(true);
    setErrorMessage('');

    try {
      const selected = results.filter((item) => selectedIds.includes(item.id));

      for (const item of selected) {
        if (item.type === 'person') {
          const company = await Company.create({
            name: item.company?.name || 'Unknown Company',
            domain: item.company?.domain || '',
            hq_city: item.company?.city || '',
            hq_country: item.company?.country || '',
            industry: item.company?.industry || '',
            employee_count: item.company?.employee_count || '',
            annual_revenue: item.company?.annual_revenue || '',
            enrichment_status: 'enriched',
            enrichment_data: {
              source: 'pulse',
              imported_date: new Date().toISOString(),
              imported_by: user?.id ?? null,
              raw: item,
            },
          });

          await Contact.create({
            company_id: company.id,
            full_name: item.full_name || '',
            title: item.title || '',
            dept: item.department || '',
            email: item.email || '',
            phone: item.phone || '',
            linkedin: item.linkedin_url || '',
            source: 'pulse',
            verified: Boolean(item.email || item.phone),
          });
        } else {
          const company = await Company.create({
            name: item.name,
            domain: item.domain || '',
            hq_city: item.city || '',
            hq_country: item.country || '',
            industry: item.industry || '',
            employee_count: item.employee_count || '',
            annual_revenue: item.annual_revenue || '',
            enrichment_status: 'enriched',
            enrichment_data: {
              source: 'pulse',
              imported_date: new Date().toISOString(),
              imported_by: user?.id ?? null,
              raw: item,
            },
          });

          if (Array.isArray(item.contacts)) {
            for (const contact of item.contacts) {
              await Contact.create({
                company_id: company.id,
                full_name: contact.full_name || contact.name || '',
                title: contact.title || '',
                dept: contact.department || '',
                email: contact.email || '',
                phone: contact.phone || '',
                linkedin: contact.linkedin_url || '',
                source: 'pulse',
                verified: Boolean(contact.email || contact.phone),
              });
            }
          }
        }
      }

      setSelectedIds([]);
    } catch (error) {
      console.error('[Pulse] import failed:', error);
      setErrorMessage(error?.message || 'Import failed. Review entity permissions and payload mapping.');
    } finally {
      setIsImporting(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      handleSearch();
    }
  }

  function toggleSelected(id, checked) {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id)
    );
  }

  function toggleExpanded(id) {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className='space-y-8 px-[10px] pb-10'>
      <section className='relative overflow-hidden rounded-[36px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_rgba(255,255,255,0.96)_40%,_rgba(255,255,255,1)_78%)] px-6 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:px-10 md:py-14'>
        <div className='mx-auto max-w-5xl text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-400'>
            Lead Intelligence
          </p>

          <div className='mt-4 flex items-center justify-center gap-3'>
            <h1 className='text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-6xl'>
              Find the right companies and the right contacts in one search.
            </h1>
            {statusPill}
          </div>

          <p className='mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 md:text-lg'>
            Describe your ideal account or buyer in plain English. Pulse searches live business
            and contact data, qualifies the best matches, and gets them ready for outreach inside
            Logistics Intel.
          </p>

          <div className='mt-8 flex justify-center'>
            <ModeToggle value={uiMode} onChange={setUiMode} />
          </div>

          <div className='mx-auto mt-8 max-w-4xl rounded-[32px] border border-slate-200 bg-white p-4 shadow-[0_16px_60px_rgba(15,23,42,0.08)]'>
            <div className='flex items-start gap-4'>
              <PulseLogo className='mt-1 h-12 w-12 p-2.5' />

              <div className='flex-1'>
                <textarea
                  rows={4}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='Find logistics companies in Georgia with over $1B in revenue and the VP of Sales at each one'
                  className='w-full resize-none border-0 bg-transparent px-0 py-2 text-base text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-0 md:text-lg'
                />

                <div className='mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3'>
                  <p className='text-sm text-slate-500'>
                    Examples: find shippers in Georgia over $1B revenue • find VPs of sales at 3PLs in Atlanta
                  </p>

                  <button
                    type='button'
                    onClick={handleSearch}
                    disabled={isSearching || !query.trim()}
                    className='inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    {isSearching ? <Sparkles className='h-4 w-4 animate-pulse' /> : <ArrowUp className='h-4 w-4' />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className='mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2'>
            {PROMPT_CHIPS.map((chip) => (
              <button
                key={chip}
                type='button'
                onClick={() => setQuery(chip)}
                className='rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className='flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
          <AlertCircle className='mt-0.5 h-5 w-5 flex-shrink-0' />
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {isSearching ? (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className='h-44 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]'
            />
          ))}
        </div>
      ) : !searchPerformed ? (
        <div className='rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-[0_12px_40px_rgba(15,23,42,0.06)]'>
          <PulseLogo className='mx-auto h-14 w-14 p-3' />
          <h3 className='mt-4 text-xl font-semibold text-slate-900'>
            Search companies, discover buyers, and build pipeline faster.
          </h3>
          <p className='mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500'>
            Use Auto mode for one-prompt prospecting, Companies mode for account discovery,
            or People mode when you already know the title you want.
          </p>
        </div>
      ) : (
        <section className='space-y-5'>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <div>
              <div className='text-sm font-semibold text-slate-900'>
                {meta?.total ?? results.length} result{(meta?.total ?? results.length) === 1 ? '' : 's'}
              </div>
              <div className='mt-1 text-sm text-slate-500'>
                Mode: {resultMode || 'unknown'}
                {meta?.estimatedMarketSize ? ` • Market size ${meta.estimatedMarketSize}` : ''}
              </div>
            </div>

            <button
              type='button'
              onClick={importSelected}
              disabled={!selectedIds.length || isImporting}
              className='inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isImporting ? <Sparkles className='h-4 w-4 animate-pulse' /> : <Download className='h-4 w-4' />}
              Import Selected
            </button>
          </div>

          {isPeopleMode ? (
            <div className='grid gap-4'>
              {results.map((person) => (
                <PeopleCard
                  key={person.id}
                  person={person}
                  selected={selectedIds.includes(person.id)}
                  onSelect={(checked) => toggleSelected(person.id, Boolean(checked))}
                />
              ))}
            </div>
          ) : isCompanyMode ? (
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {results.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  selected={selectedIds.includes(company.id)}
                  onSelect={(checked) => toggleSelected(company.id, Boolean(checked))}
                  expanded={expandedCompanies.has(company.id)}
                  onToggleExpand={() => toggleExpanded(company.id)}
                />
              ))}
            </div>
          ) : (
            <div className='rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-[0_12px_40px_rgba(15,23,42,0.06)]'>
              No supported result mode returned from Pulse.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
