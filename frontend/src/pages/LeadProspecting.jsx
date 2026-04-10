import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Building2,
  Download,
  ExternalLink,
  Mail,
  Phone,
  Search,
  Sparkles,
  UserRound,
  Users,
  Eye,
  Bookmark,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Company, Contact } from '@/api/entities';
import { useAuth } from '@/auth/AuthProvider';
import { searchPulse } from '@/api/pulse';

const BRAND = {
  navy: 'bg-[#17233C]',
  navyText: 'text-[#17233C]',
  navyBorder: 'border-[#17233C]',
  blue: 'bg-[#4C6FFF]',
  blueText: 'text-[#4C6FFF]',
  blueBorder: 'border-[#4C6FFF]',
  lightBlueBg: 'bg-[#EEF3FF]',
};

const TYPEWRITER_EXAMPLES = [
  'Find logistics companies in Georgia with over $1B in revenue',
  'Find 5 VPs of Sales at freight forwarders in Atlanta',
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
    { id: 'auto', label: 'Auto', icon: Sparkles },
    { id: 'companies', label: 'Companies', icon: Building2 },
    { id: 'people', label: 'People', icon: UserRound },
  ];

  return (
    <div className='inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm'>
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
                ? 'bg-[#4C6FFF] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#EEF3FF] hover:text-[#17233C]',
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

function StatusPill({ status }) {
  const value = (status || '').toLowerCase();

  if (value.includes('recent') || value.includes('high')) {
    return (
      <span className='inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700'>
        High
      </span>
    );
  }

  if (value.includes('medium')) {
    return (
      <span className='inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700'>
        Medium
      </span>
    );
  }

  return (
    <span className='inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600'>
      Prospect
    </span>
  );
}

function MetricBar({ value }) {
  const pct = typeof value === 'number' && value > 0 ? Math.min(100, value) : 0;

  return (
    <div className='h-3 w-16 rounded bg-slate-100'>
      <div
        className='h-3 rounded bg-[#4C6FFF]'
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CompactSearchBar({
  query,
  setQuery,
  uiMode,
  setUiMode,
  onSearch,
  isSearching,
}) {
  const showTypewriter = !query.trim();

  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex min-w-0 flex-1 items-start gap-3'>
          <PulseLogo className='mt-1 h-10 w-10 p-2' />

          <div className='min-w-0 flex-1'>
            <div className='mb-2'>
              <ModeToggle value={uiMode} onChange={setUiMode} />
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

function DesktopHero({
  query,
  setQuery,
  uiMode,
  setUiMode,
  onSearch,
  isSearching,
}) {
  const showTypewriter = !query.trim();

  return (
    <section className='hidden rounded-[32px] border border-slate-200 bg-white px-8 py-12 shadow-sm md:block'>
      <div className='mx-auto max-w-4xl text-center'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-400'>
          Lead Intelligence
        </p>

        <div className='mt-4'>
          <h1 className='text-5xl font-semibold leading-tight tracking-[-0.04em] text-[#17233C]'>
            Find the right companies and the right contacts in one search.
          </h1>
        </div>

        <p className='mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600'>
          Describe your ideal account or buyer in plain English. Pulse searches live business
          and contact data, qualifies the best matches, and gets them ready for outreach inside
          Logistics Intel.
        </p>

        <div className='mt-8 flex justify-center'>
          <ModeToggle value={uiMode} onChange={setUiMode} />
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
                  Examples: find shippers in Georgia over $1B revenue • find VPs of sales at 3PLs in Atlanta
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

function CompanyResultsTable({ rows, selectedIds, onToggleSelect, onOpenSearch, onSaveCompany }) {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[1100px]'>
          <thead className='border-b border-slate-200 bg-slate-50'>
            <tr className='text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
              <th className='px-4 py-4'></th>
              <th className='px-4 py-4'>Company</th>
              <th className='px-4 py-4'>Location</th>
              <th className='px-4 py-4'>Industry</th>
              <th className='px-4 py-4'>Shipments (12m)</th>
              <th className='px-4 py-4'>TEU</th>
              <th className='px-4 py-4'>Mode</th>
              <th className='px-4 py-4'>Last Shipment</th>
              <th className='px-4 py-4'>Status</th>
              <th className='px-4 py-4'>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((company) => (
              <tr key={company.id} className='border-b border-slate-100 last:border-b-0'>
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
                      <div className='text-sm text-slate-500'>
                        {company.domain || 'No domain'}
                      </div>
                    </div>
                  </div>
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {[company.city, company.state, company.country].filter(Boolean).join(', ') || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.industry || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm font-semibold text-[#17233C]'>
                  {typeof company.shipments_12m === 'number' ? company.shipments_12m.toLocaleString() : '—'}
                </td>

                <td className='px-4 py-4 align-top'>
                  <MetricBar value={company.teu_12m} />
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.mode || '—'}
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.last_shipment || '—'}
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
                      title='Save Company'
                    >
                      <Bookmark className='h-4 w-4' />
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
}) {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[1200px]'>
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
              <tr key={person.id} className='border-b border-slate-100 last:border-b-0'>
                <td className='px-4 py-4 align-top'>
                  <Checkbox
                    checked={selectedIds.includes(person.id)}
                    onCheckedChange={(checked) => onToggleSelect(person.id, Boolean(checked))}
                  />
                </td>

                <td className='px-4 py-4 align-top'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100'>
                      <UserRound className='h-4 w-4 text-slate-500' />
                    </div>
                    <div>
                      <div className='font-semibold text-[#17233C]'>
                        {person.full_name || 'Unknown Contact'}
                      </div>
                      <div className='text-sm text-slate-500'>
                        {person.department || person.seniority || 'Contact'}
                      </div>
                    </div>
                  </div>
                </td>

                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {person.title || '—'}
                </td>

                <td className='px-4 py-4 align-top'>
                  <div className='font-medium text-[#17233C]'>
                    {person.company?.name || 'Unknown Company'}
                  </div>
                  <div className='text-sm text-slate-500'>
                    {person.company?.industry || '—'}
                  </div>
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
                  ) : '—'}
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
                      title='Save Contact'
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

function MobileSearchOnly({
  query,
  setQuery,
  uiMode,
  setUiMode,
  onSearch,
  isSearching,
}) {
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

      <div className='mb-3'>
        <ModeToggle value={uiMode} onChange={setUiMode} />
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

export default function LeadProspecting() {
  const { user } = useAuth();

  const [uiMode, setUiMode] = useState('auto');
  const [query, setQuery] = useState('');
  const [resultMode, setResultMode] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [meta, setMeta] = useState(null);
  const [apiStatus, setApiStatus] = useState('unknown');

  const isPeopleMode = resultMode === 'people';
  const isCompanyMode =
    resultMode === 'companies' || resultMode === 'hybrid_people_over_company';

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

    return null;
  }, [apiStatus]);

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

  function toggleSelected(id, checked) {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id)
    );
  }

  async function handleSaveCompany(company) {
    try {
      await Company.create({
        name: company.name || 'Unknown Company',
        domain: company.domain || '',
        hq_city: company.city || '',
        hq_country: company.country || '',
        industry: company.industry || '',
        employee_count: company.employee_count || '',
        annual_revenue: company.annual_revenue || '',
        enrichment_status: 'enriched',
        enrichment_data: {
          source: 'pulse',
          imported_date: new Date().toISOString(),
          imported_by: user?.id ?? null,
          raw: company,
        },
      });
    } catch (error) {
      console.error('[Pulse] save company failed:', error);
      setErrorMessage(error?.message || 'Failed to save company.');
    }
  }

  async function handleSaveContact(person) {
    try {
      const company = await Company.create({
        name: person.company?.name || 'Unknown Company',
        domain: person.company?.domain || '',
        hq_city: person.company?.city || '',
        hq_country: person.company?.country || '',
        industry: person.company?.industry || '',
        employee_count: person.company?.employee_count || '',
        annual_revenue: person.company?.annual_revenue || '',
        enrichment_status: 'enriched',
        enrichment_data: {
          source: 'pulse',
          imported_date: new Date().toISOString(),
          imported_by: user?.id ?? null,
          rawCompany: person.company,
        },
      });

      await Contact.create({
        company_id: company.id,
        full_name: person.full_name || '',
        title: person.title || '',
        dept: person.department || '',
        email: person.email || '',
        phone: person.phone || '',
        linkedin: person.linkedin_url || '',
        source: 'pulse',
        verified: Boolean(person.email || person.phone),
      });
    } catch (error) {
      console.error('[Pulse] save contact failed:', error);
      setErrorMessage(error?.message || 'Failed to save contact.');
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

      {statusPill ? (
        <div className='flex justify-end'>
          {statusPill}
        </div>
      ) : null}

      {errorMessage ? (
        <div className='flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
          <AlertCircle className='mt-0.5 h-5 w-5 flex-shrink-0' />
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {isSearching ? (
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
          <div className='p-8 text-center text-slate-500'>
            <Sparkles className='mx-auto h-6 w-6 animate-pulse text-[#4C6FFF]' />
            <div className='mt-3 text-sm font-medium'>Searching live business and contact data...</div>
          </div>
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
                {meta?.estimatedMarketSize ? ` • Market size ${meta.estimatedMarketSize}` : ''}
              </div>
            </div>

            <button
              type='button'
              onClick={importSelected}
              disabled={!selectedIds.length || isImporting}
              className='inline-flex items-center gap-2 rounded-full bg-[#17233C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D2C4A] disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isImporting ? <Sparkles className='h-4 w-4 animate-pulse' /> : <Download className='h-4 w-4' />}
              Import Selected
            </button>
          </div>

          {isPeopleMode ? (
            <PeopleResultsTable
              rows={results}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onSaveContact={handleSaveContact}
              onOpenCompanySearch={openInSearch}
            />
          ) : isCompanyMode ? (
            <CompanyResultsTable
              rows={results}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onOpenSearch={openInSearch}
              onSaveCompany={handleSaveCompany}
            />
          ) : (
            <div className='rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm'>
              No supported result mode returned.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
