import { useCallback, useMemo, useRef, useState } from 'react';
import { searchCompanies as searchCompaniesHelper } from '@/lib/api';

export type SearchRow = {
  company_id?: string;
  company_name: string;
  shipments_12m?: number;
  last_activity?: { value?: string };
  top_routes?: Array<{ origin_country?: string; dest_country?: string; shipments?: number }>;
};

type Page = { rows: SearchRow[]; nextOffset: number; token: string };

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
    const data = await searchCompaniesHelper({
      q: token ?? null,
      origin: f.origin,
      destination: f.destination,
      hs: f.hs,
      mode: f.mode,
      date_start: f.date_start ?? null,
      date_end: f.date_end ?? null,
      origin_city: f.origin_city ?? null,
      dest_city: f.dest_city ?? null,
      dest_state: f.dest_state ?? null,
      dest_postal: f.dest_postal ?? null,
      dest_port: f.dest_port ?? null,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    }, signal);
    const got: SearchRow[] = data?.items ?? [];
    const total = data?.total ?? got.length;
    const nextOffset = offset + limit >= total ? -1 : offset + limit;
    return { rows: got, nextOffset, token: String(token ?? '') } as Page;
  };

  const run = useCallback(async (reset = true, filtersOverride?: SearchFilters) => {
    const f = filtersOverride ?? filters;
    if (reset) { pagesRef.current = []; setPage(1); }
    setLoading(true);
    try {
      // cancel in-flight
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
      setRows(Array.from(dedup.values()).slice(0, limit));
      // set hasNext based on any page having more
      setHasNext(firstPages.some(p => p.nextOffset !== -1));
      // best-effort total: if single token use API total, else use dedup seen so far
      const firstTotal = (firstPages.length === 1) ? (await Promise.resolve(0), (pagesRef.current as any), (firstPages[0] as any)) : null;
      if (firstPages.length === 1) setTotal(total);
      else setTotal(dedup.size);
    } catch (err) {
      console.error('[useSearch] run error', err);
      setRows([]);
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }, [tokens, filters, limit]);

  const next = useCallback(async () => {
    setLoading(true);
    try {
      const ac = new AbortController();
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = ac;

      const advanced = await Promise.all(
        pagesRef.current.map(async p => {
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
      const pageNum = page + 1;
      setPage(pageNum);
      setRows(Array.from(dedup.values()).slice((pageNum-1)*limit, pageNum*limit));
      setHasNext(advanced.some(p => p.nextOffset !== -1));
    } catch (err) {
      console.error('[useSearch] next error', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters, limit]);

  const prev = useCallback(() => {
    if (page <= 1) return;
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

  return { q, setQ, rows, loading, run, next, prev, page, limit, setLimit, filters, setFilters, hasNext, total };
}
