import { useCallback, useMemo, useRef, useState } from 'react';
import { searchCompanies as searchCompaniesHelper, postSearchCompanies } from '@/lib/api';

export type SearchRow = {
  company_id?: string;
  company_name: string;
  shipments_12m?: number;
  last_activity?: { value?: string };
  top_routes?: Array<{ origin_country?: string; dest_country?: string; shipments?: number }>;
};

type Page = { rows: SearchRow[]; nextOffset: number; token: string; total: number; offset: number; limit: number };

export type SearchFilters = {
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

const RE_SPLIT = /(?:\sand\s|,|\|)+/i;

const toErrorMessage = (err: unknown) => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return 'Search failed.';
};

export function useSearch() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pagesRef = useRef<Page[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [limit, setLimit] = useState<number>(25);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
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
  });

  const tokens = useMemo(() => {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const t = trimmed.split(RE_SPLIT).map(s => s.trim()).filter(Boolean);
    return t.length ? t.slice(0, 4) : [trimmed];
  }, [q]);

  const fetchTokenPage = async (token: string | null, f: SearchFilters, offset = 0, signal?: AbortSignal) => {
    const baseResult = await searchCompaniesHelper({
      q: token ?? null,
      origin: f.origin,
      dest: f.destination,
      hs: f.hs,
      mode: f.mode,
      startDate: f.date_start ?? null,
      endDate: f.date_end ?? null,
      origin_city: f.origin_city ?? null,
      dest_city: f.dest_city ?? null,
      dest_state: f.dest_state ?? null,
      dest_postal: f.dest_postal ?? null,
      dest_port: f.dest_port ?? null,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      offset,
      limit,
    }, signal);

    let got: SearchRow[] = Array.isArray(baseResult?.rows)
      ? baseResult.rows
      : (Array.isArray(baseResult?.items) ? baseResult.items : []);
    let totalCount = typeof baseResult?.total === 'number'
      ? baseResult.total
      : got.length;

    if (!Array.isArray(got) || got.length === 0) {
      try {
        const legacy = await postSearchCompanies({ q: token ?? null, limit, offset });
        const items = Array.isArray(legacy?.rows)
          ? legacy.rows
          : (Array.isArray(legacy?.items) ? legacy.items : (Array.isArray(legacy?.results) ? legacy.results : []));
        const tot = typeof legacy?.total === 'number'
          ? legacy.total
          : (legacy?.meta?.total ?? legacy?.count ?? items.length);
        got = items as any;
        totalCount = Number(tot ?? got.length);
      } catch {}
    }

    const nextOffset = offset + limit >= totalCount ? -1 : offset + limit;
    return { rows: got, nextOffset, token: String(token ?? ''), total: totalCount, offset, limit };
  };

  const run = useCallback(async (reset = true, filtersOverride?: SearchFilters) => {
    const f = filtersOverride ?? filters;
    if (reset) { pagesRef.current = []; setPage(1); }
    setLoading(true);
    setError(null);
    try {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const firstPages = tokens.length > 0
        ? await Promise.all(tokens.map(t => fetchTokenPage(t, f, 0, ac.signal)))
        : [await fetchTokenPage(null, f, 0, ac.signal)];
      pagesRef.current = firstPages;
      const dedup = new Map<string, SearchRow>();
      for (const p of firstPages) {
        for (const r of p.rows) {
          const key = (r.company_id?.trim() || `name:${r.company_name.toLowerCase()}`);
          if (!dedup.has(key)) dedup.set(key, r);
        }
      }
      const deduped = Array.from(dedup.values());
      setRows(deduped.slice(0, limit));
      setHasNext(firstPages.some(p => p.nextOffset !== -1));

      const computedTotal = firstPages.length === 1
        ? firstPages[0].total
        : deduped.length;
      setTotal(computedTotal);
    } catch (err) {
      console.error('[useSearch] run error', err);
      setRows([]);
      setHasNext(false);
      setTotal(0);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tokens, filters, limit]);

  const next = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ac = new AbortController();
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = ac;

      const advanced = await Promise.all(
        pagesRef.current.map(async (p) => {
          if (p.nextOffset === -1) return p;
          return fetchTokenPage(p.token, filters, p.nextOffset, ac.signal);
        })
      );
      pagesRef.current = advanced;
      const dedup = new Map<string, SearchRow>();
      for (const p of advanced) {
        for (const r of p.rows) {
          const key = (r.company_id?.trim() || `name:${r.company_name.toLowerCase()}`);
          if (!dedup.has(key)) dedup.set(key, r);
        }
      }
      const deduped = Array.from(dedup.values());
      const pageNum = page + 1;
      setPage(pageNum);
      setRows(deduped.slice((pageNum - 1) * limit, pageNum * limit));
      setHasNext(advanced.some(p => p.nextOffset !== -1));
      const computedTotal = advanced.length === 1 ? advanced[0].total : deduped.length;
      setTotal(computedTotal);
    } catch (err) {
      console.error('[useSearch] next error', err);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, filters, limit]);

  const prev = useCallback(() => {
    if (page <= 1) return;
    setError(null);
    const pageNum = page - 1;
    const all = Array.from(
      pagesRef.current.reduce((acc, p) => {
        for (const r of p.rows) {
          const key = (r.company_id?.trim() || `name:${r.company_name.toLowerCase()}`);
          if (!acc.has(key)) acc.set(key, r);
        }
        return acc;
      }, new Map<string, SearchRow>())
    ).map(([, v]) => v);
    setPage(pageNum);
    setRows(all.slice((pageNum-1)*limit, pageNum*limit));
    setHasNext(pagesRef.current.some(p => p.nextOffset !== -1));
  }, [page, limit]);

  return { q, setQ, rows, loading, run, next, prev, page, limit, setLimit, filters, setFilters, hasNext, total, error, setError };
}
