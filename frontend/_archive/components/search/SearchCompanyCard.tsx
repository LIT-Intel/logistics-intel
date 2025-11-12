import { Globe, Phone, MapPin, Building2 } from 'lucide-react';
import type { IySearchRow } from '@/lib/api';

function Flag({ code }: { code?: string | null }) {
  if (!code) return <span className="text-xl">🏳️</span>;
  const cc = code.trim().slice(0, 2).toUpperCase();
  const flag = cc.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  return <span className="text-xl">{flag}</span>;
}

export default function SearchCompanyCard({ row, onOpen }: { row: IySearchRow; onOpen?: (id: string) => void }) {
  const id = row.company_id || '';
  const domain = row.website?.replace(/^https?:\/\//, '') || '';
  const name = row.name || 'Unknown company';

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow transition">
      <div className="flex items-start gap-4">
        {/* logo placeholder (swap with logo.dev later) */}
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-slate-500" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold truncate">{name}</h3>
            <Flag code={row.country || undefined} />
            {row.role ? (
              <span className="ml-2 text-xs rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                {row.role}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            {row.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {row.address}
              </span>
            )}
            {domain && (
              <a
                className="inline-flex items-center gap-1 hover:underline"
                href={row.website!}
                target="_blank"
                rel="noreferrer"
              >
                <Globe className="w-4 h-4" /> {domain}
              </a>
            )}
            {row.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-4 h-4" /> {row.phone}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500">Total Shipments</div>
              <div className="text-lg font-semibold">{row.total_shipments ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Most Recent Shipment</div>
              <div className="text-lg font-semibold">{row.most_recent_shipment ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Aliases / Addresses</div>
              <div className="text-lg font-semibold">
                {(row.aliases_count ?? '—')} / {(row.addresses_count ?? '—')}
              </div>
            </div>
          </div>

          {(row.top_suppliers?.length || row.top_customers?.length) ? (
            <div className="mt-3 text-sm text-slate-600 line-clamp-2">
              {row.top_customers?.length ? (
                <>
                  Top Customers: {row.top_customers.slice(0, 3).join(', ')}
                  {row.top_customers.length > 3 ? ` +${row.top_customers.length - 3}` : ''}
                </>
              ) : row.top_suppliers?.length ? (
                <>
                  Top Suppliers: {row.top_suppliers.slice(0, 3).join(', ')}
                  {row.top_suppliers.length > 3 ? ` +${row.top_suppliers.length - 3}` : ''}
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <button
            onClick={() => onOpen?.(id)}
            className="rounded-xl px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
