import { useCallback, useMemo, useRef, useState } from 'react';

export type SearchRow = {
  company_id?: string;
  company_name: string;
  shipments_12m?: number;
  last_activity?: { value?: string };
  top_routes?: Array<{ origin_country?: string; dest_country?: string; shipments?: number }>;
};

type Page = { rows: SearchRow[]; nextOffset: number; token: string };

const RE_SPLIT = /(?:\sand\s|,|\|)+/i;

export function useSearch() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pagesRef = useRef<Page[]>([]);
  const LIMIT = 25;

  const tokens = useMemo(() => {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const t = trimmed.split(RE_SPLIT).map(s => s.trim()).filter(Boolean);
    return t.length ? t.slice(0, 4) : [trimmed];
  }, [q]);

  const fetchTokenPage = async (token: string, offset = 0) => {
    const res = await fetch('/api/lit/public/searchCompanies', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ q: token, limit: LIMIT, offset }),
    });
    const data = await res.json();
    const got: SearchRow[] = data?.rows ?? data?.results ?? [];
    const total = data?.meta?.total ?? got.length;
    const nextOffset = offset + LIMIT >= total ? -1 : offset + LIMIT;
    return { rows: got, nextOffset, token } as Page;
  };

  const run = useCallback(async (reset = true) => {
    if (reset) { pagesRef.current = []; setPage(1); }
    setLoading(true);
    const firstPages = await Promise.all(tokens.map(t => fetchTokenPage(t, 0)));
    pagesRef.current = firstPages;
    const dedup = new Map<string, SearchRow>();
    for (const p of firstPages) {
      for (const r of p.rows) {
        const key = (r.company_id?.trim() || `name:${r.company_name.toLowerCase()}`);
        if (!dedup.has(key)) dedup.set(key, r);
      }
    }
    setRows(Array.from(dedup.values()).slice(0, LIMIT));
    setLoading(false);
  }, [tokens]);

  const next = useCallback(async () => {
    setLoading(true);
    const advanced = await Promise.all(
      pagesRef.current.map(async p => {
        if (p.nextOffset === -1) return p;
        return fetchTokenPage(p.token, p.nextOffset);
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
    setRows(Array.from(dedup.values()).slice((pageNum-1)*LIMIT, pageNum*LIMIT));
    setLoading(false);
  }, [page]);

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
    setRows(all.slice((pageNum-1)*LIMIT, pageNum*LIMIT));
  }, [page]);

  return { q, setQ, rows, loading, run, next, prev, page, limit: LIMIT };
}
