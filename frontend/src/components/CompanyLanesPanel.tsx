import React, { useEffect, useMemo, useState } from 'react';
import { fetchCompanyLanes } from '@/lib/api';

type Props = {
  companyId?: string | null;
  limit?: number;
};

export default function CompanyLanesPanel({ companyId, limit = 3 }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(() => `${companyId ?? ''}|${limit}`, [companyId, limit]);

  useEffect(() => {
    let cancelled = false;
    if (!companyId || !companyId.trim()) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetchCompanyLanes({ company_id: companyId, limit })
      .then((data) => {
        if (cancelled) return;
        const items = (data?.rows || data?.items || data?.lanes || []) as any[];
        setRows(Array.isArray(items) ? items.slice(0, limit) : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setRows([]);
          setError(err?.message || 'Failed to load lanes');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, companyId, limit]);

  if (!companyId) {
    return <span className="text-sm text-slate-500">Select a company to view lanes.</span>;
  }

  if (loading) {
    return <span className="text-sm text-slate-500">Loading lanes…</span>;
  }

  if (error) {
    return <span className="text-sm text-rose-600">{error}</span>;
  }

  if (!rows.length) {
    return <span className="text-sm text-slate-500">No lane analytics yet.</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((lane, idx) => {
        const origin = cleanLabel(lane.origin_country || lane.origin_label || lane.origin);
        const dest = cleanLabel(lane.dest_country || lane.dest_label || lane.dest);
        const count = lane.cnt ?? lane.shipments ?? lane.count ?? 0;
        return (
          <span
            key={`${origin}-${dest}-${idx}`}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
          >
            <span>{origin}</span>
            <span className="text-slate-400">→</span>
            <span>{dest}</span>
            <span className="text-indigo-500">({formatCount(count)})</span>
          </span>
        );
      })}
    </div>
  );
}

function cleanLabel(value: unknown) {
  if (value == null) return 'Unknown';
  const text = String(value).trim();
  if (!text) return 'Unknown';
  if (text.toLowerCase() === 'none' || text === '-') return 'Unknown';
  return text;
}

function formatCount(value: unknown) {
  const num = typeof value === 'number' ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return '0';
  return new Intl.NumberFormat().format(num);
}
