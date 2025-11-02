import { useCallback, useEffect, useRef, useState } from 'react';
import { searchCompanies as searchCompaniesHelper } from '@/lib/api';

type SearchRow = {
  company_id?: string;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: string | { value?: string } | null;
  top_routes?: Array<{ origin_country?: string; dest_country?: string; shipments?: number }>;
  top_carriers?: Array<{ carrier?: string }>;
};

type SearchFilters = {
  origin: string | null;
  destination: string | null;
  hs: string | null;
  mode: 'air' | 'ocean' | null;
  date_start?: string | null;
  date_end?: string | null;
  year?: string | null;
  origin_city?: string | null;
  dest_city?: string | null;
  dest_state?: string | null;
  dest_postal?: string | null;
  dest_port?: string | null;
};

type SearchState = {
  q: string;
  setQ: (value: string) => void;
  rows: SearchRow[];
  loading: boolean;
  run: (reset?: boolean) => void;
  next: () => void;
  prev: () => void;
  page: number;
  limit: number;
  setLimit: (value: number) => void;
  filters: SearchFilters;
  setFilters: (updater: (prev: SearchFilters) => SearchFilters) => void;
  hasNext: boolean;
  total: number | null;
  initialized: boolean;
};

const DEFAULT_FILTERS: SearchFilters = {
  origin: null,
  destination: null,
  hs: null,
  mode: null,
  date_start: null,
  date_end: null,
  year: null,
  origin_city: null,
  dest_city: null,
  dest_state: null,
  dest_postal: null,
  dest_port: null,
};

export function useSearch(): SearchState {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(20);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [filters, setFiltersState] = useState<SearchFilters>(DEFAULT_FILTERS);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAt = useCallback(async (targetOffset: number) => {
    const normalizedOffset = Math.max(0, targetOffset);
    setLoading(true);
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const { items, total } = await searchCompaniesHelper({
        q: q.trim() || null,
        origin: filters.origin,
        dest: filters.destination,
        hs: filters.hs,
        mode: filters.mode || undefined,
        startDate: filters.date_start || undefined,
        endDate: filters.date_end || undefined,
        limit,
        offset: normalizedOffset,
      }, ac.signal);

      const list = Array.isArray(items) ? (items as SearchRow[]) : [];
      const totalCount = typeof total === 'number' ? total : list.length;

      setRows(list);
      setTotal(totalCount);
      setHasNext(normalizedOffset + limit < totalCount);
      setOffset(normalizedOffset);
      setPage(Math.floor(normalizedOffset / limit) + 1);
    } catch (err) {
      console.error('[useSearch] fetch error', err);
      setRows([]);
      setHasNext(false);
      if (initialized) {
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [q, filters, limit, initialized]);

  const run = useCallback((reset = true) => {
    if (reset) {
      fetchAt(0);
    } else {
      fetchAt(offset);
    }
  }, [fetchAt, offset]);

  const next = useCallback(() => {
    if (total != null && offset + limit >= total) return;
    fetchAt(offset + limit);
  }, [fetchAt, offset, limit, total]);

  const prev = useCallback(() => {
    if (offset === 0) return;
    fetchAt(Math.max(0, offset - limit));
  }, [fetchAt, offset, limit]);

  useEffect(() => {
    fetchAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilters = useCallback((updater: (prev: SearchFilters) => SearchFilters) => {
    setFiltersState((prev) => updater({ ...prev }));
  }, []);

  return {
    q,
    setQ,
    rows,
    loading,
    run,
    next,
    prev,
    page,
    limit,
    setLimit,
    filters,
    setFilters,
    hasNext,
    total,
    initialized,
  };
}
