import React, { useEffect, useState } from 'react';
import type { SearchRow } from '@/lib/types';
import { buildCompanyShipmentsUrl } from '@/lib/api';

export default function CompanyModal({
  company,
  shipmentsUrl,
  onClose,
}: {
  company: SearchRow;
  shipmentsUrl: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = buildCompanyShipmentsUrl(company, 50, 0);
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(d => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  }, [company?.company_id, company?.company_name]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{company.company_name}</div>
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5">Close</button>
        </div>
        <div className="mt-3">
          {loading ? 'Loading shipments…' : (
            rows.length ? (
              <div className="text-sm text-slate-700">Showing {rows.length} shipments…</div>
            ) : (
              <div className="text-sm text-slate-500">No shipments found.</div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
