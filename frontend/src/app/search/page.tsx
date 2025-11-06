'use client';

import { useEffect, useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import {
  getCompanyKey,
  postImportYetiSearch,
  saveCompanyToCrm,
  searchCompanies,
} from '@/lib/api';
import type { SearchRow } from '@/lib/types';
import type { ImportYetiSearchResp, ImportYetiSearchRow } from '@/types/importyeti';
import ShipperCard from '@/components/search/ShipperCard';
import CompanyCard from '@/components/search/CompanyCard';
import CompanyModal from '@/components/search/CompanyModal';

type SearchMode = 'shippers' | 'companies';

type CompanyModalProps = Parameters<typeof CompanyModal>[0];

type ShipperState = {
  rows: ImportYetiSearchRow[];
  total: number;
  meta?: ImportYetiSearchResp['meta'];
  loading: boolean;
  error: string | null;
};

type CompanyState = {
  rows: SearchRow[];
  total: number;
  loading: boolean;
  error: string | null;
};

type ModalContext =
  | { mode: 'shippers'; shipper: ImportYetiSearchRow }
  | { mode: 'companies'; company: SearchRow };

const PAGE_SIZE = 12;

export default function SearchPage() {
  const [keyword, setKeyword] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('q') ?? '';
    }
    return '';
  });

  const [searchMode, setSearchMode] = useState<SearchMode>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'companies' ? 'companies' : 'shippers';
    }
    return 'shippers';
  });

  const [shipperPage, setShipperPage] = useState(1);
  const [companyPage, setCompanyPage] = useState(1);
  const [forceSearchTick, setForceSearchTick] = useState(0);
  const debouncedKeyword = useDebounce(keyword, 400);

  const [shipperState, setShipperState] = useState<ShipperState>({
    rows: [],
    total: 0,
    meta: undefined,
    loading: false,
    error: null,
  });

  const [companyState, setCompanyState] = useState<CompanyState>({
    rows: [],
    total: 0,
    loading: false,
    error: null,
  });

  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(() => new Set());
  const [savingCompanyKey, setSavingCompanyKey] = useState<string | null>(null);
  const [savedCompanyKeys, setSavedCompanyKeys] = useState<Set<string>>(() => new Set());

  const [modalContext, setModalContext] = useState<ModalContext | null>(null);

  const activeKeyword = debouncedKeyword.trim();
  const hasKeyword = activeKeyword.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (keyword.trim()) {
      url.searchParams.set('q', keyword.trim());
    } else {
      url.searchParams.delete('q');
    }
    url.searchParams.set('mode', searchMode);
    const search = url.searchParams.toString();
    window.history.replaceState({}, '', search ? `${url.pathname}?${search}` : url.pathname);
  }, [keyword, searchMode]);

  useEffect(() => {
    setShipperPage(1);
    setCompanyPage(1);
  }, [debouncedKeyword]);

  useEffect(() => {
    const term = activeKeyword;
    if (!term) {
      setShipperState((prev) => ({ ...prev, rows: [], total: 0, loading: false, error: null }));
      setCompanyState((prev) => ({ ...prev, rows: [], total: 0, loading: false, error: null }));
      return;
    }

    const controller = new AbortController();
    if (searchMode === 'shippers') {
      setShipperState((prev) => ({ ...prev, loading: true, error: null }));
      postImportYetiSearch({
        keyword: term,
        limit: PAGE_SIZE,
        offset: (shipperPage - 1) * PAGE_SIZE,
        signal: controller.signal,
      })
        .then((data) => {
          const rows = Array.isArray(data?.rows) ? data.rows : [];
          const total = Number.isFinite(Number(data?.meta?.total))
            ? Number(data.meta.total)
            : rows.length;
          setShipperState({ rows, total, meta: data.meta, loading: false, error: null });
        })
        .catch((err: any) => {
          if (controller.signal.aborted) return;
          setShipperState({ rows: [], total: 0, meta: undefined, loading: false, error: err?.message ?? 'Search failed' });
        });
    } else {
      setCompanyState((prev) => ({ ...prev, loading: true, error: null }));
      searchCompanies({ q: term, limit: PAGE_SIZE, offset: (companyPage - 1) * PAGE_SIZE }, controller.signal)
        .then(({ items, total }) => {
          const rows = Array.isArray(items) ? (items as SearchRow[]) : [];
          const counted = typeof total === 'number' ? total : rows.length;
          setCompanyState({ rows, total: counted, loading: false, error: null });
        })
        .catch((err: any) => {
          if (controller.signal.aborted) return;
          setCompanyState({ rows: [], total: 0, loading: false, error: err?.message ?? 'Search failed' });
        });
    }

    return () => {
      controller.abort();
    };
  }, [activeKeyword, searchMode, shipperPage, companyPage, forceSearchTick]);

  const activeState = searchMode === 'shippers' ? shipperState : companyState;
  const rows = searchMode === 'shippers' ? shipperState.rows : companyState.rows;
  const currentPage = searchMode === 'shippers' ? shipperPage : companyPage;
  const totalResults = searchMode === 'shippers' ? shipperState.total : companyState.total;
  const totalPages = totalResults > 0 ? Math.ceil(totalResults / PAGE_SIZE) : 1;

  const handleModeChange = (value: string) => {
    if (value === 'shippers' || value === 'companies') {
      setSearchMode(value);
      setShipperPage(1);
      setCompanyPage(1);
    }
  };

  const handlePageChange = (page: number) => {
    if (page < 1) return;
    if (searchMode === 'shippers') {
      setShipperPage(page);
    } else {
      setCompanyPage(page);
    }
  };

  const triggerSearch = () => {
    if (searchMode === 'shippers') {
      setShipperPage(1);
    } else {
      setCompanyPage(1);
    }
    setForceSearchTick((prev) => prev + 1);
  };

  const handleSaveShipper = async (row: ImportYetiSearchRow) => {
    const slug = row.slug;
    setSavingSlug(slug);
    try {
      await saveCompanyToCrm({ company_name: row.title, slug, source: 'importyeti' });
      setSavedSlugs((prev) => {
        const next = new Set(prev);
        next.add(slug);
        return next;
      });
      toast({ title: 'Saved to Command Center', description: `${row.title} added from ImportYeti.` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message ?? 'Unable to save company', variant: 'destructive' });
    } finally {
      setSavingSlug(null);
    }
  };

  const handleSaveCompany = async (row: SearchRow) => {
    const key = getCompanyKey(row);
    setSavingCompanyKey(key);
    try {
      await saveCompanyToCrm({ company_id: row.company_id ?? undefined, company_name: row.company_name, source: 'companies' });
      setSavedCompanyKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      toast({ title: 'Saved to Command Center', description: `${row.company_name} added to your workspace.` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message ?? 'Unable to save company', variant: 'destructive' });
    } finally {
      setSavingCompanyKey(null);
    }
  };

  const handleViewShipper = (row: ImportYetiSearchRow) => setModalContext({ mode: 'shippers', shipper: row });
  const handleViewCompany = (row: SearchRow) => setModalContext({ mode: 'companies', company: row });
  const closeModal = () => setModalContext(null);

  const renderResults = () => {
    if (!hasKeyword) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Start typing to search verified shippers or enriched companies.
        </div>
      );
    }

    if (activeState.loading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      );
    }

    if (activeState.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
          {activeState.error}
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No results yet. Try refining your keyword.
        </div>
      );
    }

    if (searchMode === 'shippers') {
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ShipperCard
              key={row.slug}
              row={row}
              onView={handleViewShipper}
              onSave={handleSaveShipper}
              saving={savingSlug === row.slug}
              saved={savedSlugs.has(row.slug)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const key = getCompanyKey(row);
          return (
            <CompanyCard
              key={key}
              row={row}
              onOpen={handleViewCompany}
              onSave={handleSaveCompany}
              saving={savingCompanyKey === key}
              saved={savedCompanyKeys.has(key)}
            />
          );
        })}
      </div>
    );
  };

  let modalProps: CompanyModalProps | null = null;
  if (modalContext) {
    if (modalContext.mode === 'shippers') {
      const slug = modalContext.shipper.slug;
      modalProps = {
        mode: 'shippers',
        shipper: modalContext.shipper,
        onSave: handleSaveShipper,
        saving: savingSlug === slug,
        saved: savedSlugs.has(slug),
      };
    } else {
      const key = getCompanyKey(modalContext.company);
      modalProps = {
        mode: 'companies',
        company: modalContext.company,
        onSave: handleSaveCompany,
        saving: savingCompanyKey === key,
        saved: savedCompanyKeys.has(key),
      };
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Search</h1>
      <p className="mt-1 text-slate-600">
        Query the logistics intelligence index for shippers or companies and save prospects to Command Center.
      </p>

      <div className="mt-4 mb-3">
        <ToggleGroup
          type="single"
          value={searchMode}
          onValueChange={handleModeChange}
          className="justify-start"
        >
          <ToggleGroupItem
            value="shippers"
            className="rounded-full px-4 py-2 text-sm data-[state=on]:bg-indigo-600 data-[state=on]:text-white"
          >
            Shippers
          </ToggleGroupItem>
          <ToggleGroupItem
            value="companies"
            className="rounded-full px-4 py-2 text-sm data-[state=on]:bg-indigo-600 data-[state=on]:text-white"
          >
            Companies
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Keyword
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                triggerSearch();
              }
            }}
            placeholder={searchMode === 'shippers' ? 'Search verified shippers…' : 'Search companies…'}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <div className="mt-3 flex justify-end">
          <Button onClick={triggerSearch} disabled={activeState.loading} variant="secondary">
            Search now
          </Button>
        </div>
      </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Search results</h2>
              <p className="text-sm text-slate-500">
                {hasKeyword
                  ? `Found ${totalResults.toLocaleString()} ${searchMode === 'shippers' ? 'shippers' : 'companies'} • Page ${currentPage}`
                  : 'Enter a keyword to start searching.'}
              </p>
            </div>
            {hasKeyword && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || activeState.loading}
                >
                  Prev
                </Button>
                <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || activeState.loading}
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          {renderResults()}
        </div>

      {modalProps && (
        <CompanyModal
          open={Boolean(modalContext)}
          onClose={closeModal}
          {...modalProps}
        />
      )}
    </div>
  );
}
