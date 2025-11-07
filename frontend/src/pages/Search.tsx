import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CompanyDrawer from '@/components/company/CompanyDrawer';
import { iyFetchCompanyBols, iySearchShippers, saveCompany } from '@/lib/api';
import { pushLocalSaved } from '@/lib/savedStore';
import { CompanyLite, CommandCenterRecord, ShipmentLite } from '@/types/importyeti';

const PAGE_SIZE = 20;
const COMPANIES_PLACEHOLDER = 'Companies (Lusha) search is coming soon. Toggle back to Shippers (ImportYeti) while we finish that integration.';

type Mode = 'shippers' | 'companies';

type SearchResult = {
  rows: CompanyLite[];
  total: number;
};

const createRecord = (company: CompanyLite, shipments: ShipmentLite[] = []): CommandCenterRecord => ({
  company,
  shipments,
  created_at: new Date().toISOString(),
});

const suppliersPreview = (suppliers?: string[]) => {
  if (!suppliers || !suppliers.length) return '—';
  return suppliers.slice(0, 3).join(' • ');
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialMode: Mode = searchParams.get('mode') === 'companies' ? 'companies' : 'shippers';
  const initialKeyword = searchParams.get('q') ?? '';
  const initialPage = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [inputValue, setInputValue] = useState(initialKeyword);
  const [committedQuery, setCommittedQuery] = useState(initialKeyword.trim());
  const [page, setPage] = useState(initialPage);
  const [results, setResults] = useState<SearchResult>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(initialMode === 'companies' ? COMPANIES_PLACEHOLDER : null);
  const [totalPages, setTotalPages] = useState(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyLite | null>(null);

  const lastParamsRef = useRef(searchParams.toString());

  const syncParams = useCallback((keyword: string, nextMode: Mode, nextPage: number) => {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('q', keyword.trim());
    if (nextMode === 'companies') params.set('mode', 'companies');
    if (nextPage > 1) params.set('page', String(nextPage));
    const next = params.toString();
    if (lastParamsRef.current === next) return;
    lastParamsRef.current = next;
    if (next) {
      setSearchParams(params, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

  const runImportYetiSearch = useCallback(async (keyword: string, targetPage: number) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setResults({ rows: [], total: 0 });
      setCommittedQuery('');
      setTotalPages(1);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { rows, total } = await iySearchShippers({ keyword: trimmed, limit: PAGE_SIZE, offset: (targetPage - 1) * PAGE_SIZE });
      setResults({ rows, total });
      setCommittedQuery(trimmed);
      setInfoMessage(null);
      setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
    } catch (err: any) {
      setResults({ rows: [], total: 0 });
      setError(err?.message ?? 'ImportYeti search failed');
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialKeyword.trim()) {
      if (initialMode === 'companies') setInfoMessage(COMPANIES_PLACEHOLDER);
      return;
    }
    if (initialMode === 'shippers') {
      runImportYetiSearch(initialKeyword, initialPage).catch(() => undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback((event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = inputValue.trim();
    setPage(1);
    syncParams(trimmed, mode, 1);
    if (!trimmed) {
      setCommittedQuery('');
      setResults({ rows: [], total: 0 });
      setTotalPages(1);
      setInfoMessage(mode === 'companies' ? COMPANIES_PLACEHOLDER : null);
      return;
    }
    if (mode === 'companies') {
      setCommittedQuery(trimmed);
      setInfoMessage(COMPANIES_PLACEHOLDER);
      setResults({ rows: [], total: 0 });
      setTotalPages(1);
      return;
    }
    runImportYetiSearch(trimmed, 1).catch(() => undefined);
  }, [inputValue, mode, runImportYetiSearch, syncParams]);

  const handleModeChange = useCallback((next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setPage(1);
    if (next === 'companies') {
      syncParams(committedQuery, next, 1);
      setInfoMessage(COMPANIES_PLACEHOLDER);
      setResults({ rows: [], total: 0 });
      setTotalPages(1);
    } else {
      syncParams(committedQuery, next, committedQuery ? 1 : 1);
      setInfoMessage(null);
      if (committedQuery) {
        runImportYetiSearch(committedQuery, 1).catch(() => undefined);
      } else {
        setResults({ rows: [], total: 0 });
        setTotalPages(1);
      }
    }
  }, [mode, committedQuery, runImportYetiSearch, syncParams]);

  const handlePrev = useCallback(() => {
    if (loading || mode !== 'shippers' || !committedQuery || page <= 1) return;
    const nextPage = page - 1;
    setPage(nextPage);
    syncParams(committedQuery, mode, nextPage);
    runImportYetiSearch(committedQuery, nextPage).catch(() => undefined);
  }, [loading, mode, committedQuery, page, runImportYetiSearch, syncParams]);

  const handleNext = useCallback(() => {
    if (loading || mode !== 'shippers' || !committedQuery || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    syncParams(committedQuery, mode, nextPage);
    runImportYetiSearch(committedQuery, nextPage).catch(() => undefined);
  }, [loading, mode, committedQuery, page, totalPages, runImportYetiSearch, syncParams]);

  const handleOpenDrawer = useCallback((company: CompanyLite) => {
    if (company.source !== 'importyeti') return;
    setSelectedCompany(company);
    setDrawerOpen(true);
  }, []);

  const handleSave = useCallback(async (company: CompanyLite) => {
    const companyId = company.company_id;
    setSavingId(companyId);
    try {
      let shipments: ShipmentLite[] = [];
      if (company.source === 'importyeti') {
        const key = companyId.startsWith('company/') ? companyId : `company/${companyId}`;
        shipments = await iyFetchCompanyBols({ companyKey: key, limit: 10, offset: 0 });
      }
      const record = createRecord(company, shipments);
      try {
        await saveCompany(record);
      } catch (err) {
        console.warn('saveCompany failed, relying on local cache', err);
      }
      pushLocalSaved(record);
      navigate(`/command-center/${company.company_id}`);
    } finally {
      setSavingId(null);
    }
  }, [navigate]);

  const placeholderCompany = useMemo<CompanyLite | null>(() => {
    if (mode !== 'companies') return null;
    const trimmed = inputValue.trim();
    if (!trimmed) return null;
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'company-placeholder';
    return {
      company_id: slug,
      name: trimmed,
      source: 'lusha',
      address: null,
      country_code: null,
      kpis: {
        shipments_12m: 0,
        last_activity: null,
      },
    };
  }, [mode, inputValue]);

  const showInitialPrompt = !loading && !error && !infoMessage && !committedQuery && results.rows.length === 0 && mode !== 'companies';

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-24">
      <header className="pt-8 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Search</h1>
        <p className="text-sm text-slate-500">Find shippers with ImportYeti data or preview the upcoming Companies mode.</p>
      </header>

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3 pb-4">
        <div className="inline-flex rounded-2xl border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => handleModeChange('shippers')}
            className={`px-3 py-1.5 text-sm rounded-2xl ${mode === 'shippers' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            aria-pressed={mode === 'shippers'}
          >
            Shippers
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('companies')}
            className={`px-3 py-1.5 text-sm rounded-2xl ${mode === 'companies' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            aria-pressed={mode === 'companies'}
          >
            Companies
          </button>
        </div>

        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Search by company name or alias…"
          className="flex-1 min-w-[220px] sm:w-80 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs text-slate-500">
        <div>
          {loading
            ? 'Loading…'
            : mode === 'companies'
              ? 'Companies (Lusha) placeholder'
              : results.total
                ? `${results.total} shippers`
                : committedQuery
                  ? 'No shippers found'
                  : 'No results'}
        </div>
        <div className="text-slate-400">Page {page} / {totalPages}</div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}

      {!error && infoMessage && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{infoMessage}</div>
      )}

      {placeholderCompany && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm uppercase tracking-wide text-slate-400">Company</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">{placeholderCompany.name}</div>
              <div className="text-xs text-slate-500 mt-1 max-w-md">
                Lusha enrichment is on the roadmap. Save now to preview the Command Center flow.
              </div>
            </div>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">Lusha</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSave(placeholderCompany)}
              disabled={savingId === placeholderCompany.company_id}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {savingId === placeholderCompany.company_id ? 'Saving…' : 'Save to Command Center'}
            </button>
          </div>
        </div>
      )}

      {showInitialPrompt && (
        <div className="mt-6 text-sm text-slate-500">Type a company or shipper name and press Search.</div>
      )}

      {!error && results.rows.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.rows.map((company) => (
            <article key={company.company_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm uppercase tracking-wide text-slate-400">Company</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{company.name}</div>
                  <div className="text-[11px] uppercase text-slate-400 mt-0.5">ID</div>
                  <div className="text-xs text-slate-600 break-all">{company.company_id}</div>
                </div>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  {company.source === 'importyeti' ? 'ImportYeti' : company.source.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-slate-600">
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Shipments (12m)</div>
                  <div className="text-sm font-medium text-slate-900">{company.kpis.shipments_12m.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Last Activity</div>
                  <div className="text-sm font-medium text-slate-900">{company.kpis.last_activity ?? '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Top suppliers</div>
                  <div className="text-xs text-slate-600">{suppliersPreview(company.extras?.top_suppliers)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenDrawer(company)}
                  disabled={company.source !== 'importyeti'}
                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(company)}
                  disabled={savingId === company.company_id}
                  className="inline-flex items-center rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                >
                  {savingId === company.company_id ? 'Saving…' : 'Save to Command Center'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {loading && results.rows.length === 0 && mode === 'shippers' && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={handlePrev}
          disabled={loading || mode !== 'shippers' || page <= 1}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={loading || mode !== 'shippers' || page >= totalPages}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <CompanyDrawer
        company={selectedCompany}
        open={drawerOpen && Boolean(selectedCompany)}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedCompany(null);
        }}
      />
    </div>
  );
}
