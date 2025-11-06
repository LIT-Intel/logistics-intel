import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getImportYetiCompany } from '@/lib/api';
import type { ImportYetiCompany, ImportYetiSearchRow } from '@/types/importyeti';
import type { SearchRow } from '@/lib/types';

type ShipperModalProps = {
  mode: 'shippers';
  open: boolean;
  shipper: ImportYetiSearchRow | null;
  onClose: () => void;
  onSave?: (row: ImportYetiSearchRow) => Promise<void> | void;
  saving?: boolean;
  saved?: boolean;
};

type CompaniesModalProps = {
  mode: 'companies';
  open: boolean;
  company: SearchRow | null;
  onClose: () => void;
  onSave?: (row: SearchRow) => Promise<void> | void;
  saving?: boolean;
  saved?: boolean;
};

type Props = ShipperModalProps | CompaniesModalProps;

export default function CompanyModal(props: Props) {
  if (props.mode === 'shippers') {
    return <ImportYetiModal {...props} />;
  }
  return <CompaniesModal {...props} />;
}

function ImportYetiModal({ open, shipper, onClose, onSave, saving = false, saved = false }: ShipperModalProps) {
  const [detail, setDetail] = useState<ImportYetiCompany | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'shipments'>('overview');

  useEffect(() => {
    if (open) {
      setActiveTab('overview');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !shipper?.slug) {
      if (!open) {
        setDetail(null);
        setError(null);
      }
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    getImportYetiCompany(shipper.slug, controller.signal)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((err: any) => {
        if (!cancelled && !controller.signal.aborted) {
          setError(err?.message ?? 'Failed to load company');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, shipper?.slug]);

  if (!open || !shipper) {
    return null;
  }

  const title = detail?.title ?? shipper.title;
  const aliasCount = detail?.also_known_names?.length ?? 0;
  const aliasPrimary = aliasCount > 0 ? detail!.also_known_names[0] : null;
  const aliasMore = aliasCount > 1 ? aliasCount - 1 : 0;
  const address = detail?.address ?? shipper.address ?? null;
  const website = detail?.website ?? null;
  const phone = detail?.phone_number ?? null;
  const totalShipments = formatNumber(detail?.total_shipments ?? shipper.total_shipments);
  const dateRange = formatDateRange(detail?.date_range);
  const loadMix = buildLoadMix(detail);

  const recentShipments = useMemo(() => {
    if (!detail?.recent_bols) return [] as ImportYetiCompany['recent_bols'];
    return detail.recent_bols.slice(0, 10);
  }, [detail?.recent_bols]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-3xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-2xl font-semibold text-slate-900" title={title}>
                  {title}
                </DialogTitle>
                {aliasPrimary && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    aka {aliasPrimary}
                    {aliasMore > 0 ? ` +${aliasMore} more` : ''}
                  </span>
                )}
              </div>
              {address && (
                <p className="mt-2 max-w-xl truncate text-sm text-slate-500" title={address}>
                  {address}
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={() => shipper && onSave?.(shipper)}
              disabled={saving || saved}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saved ? 'Saved' : saving ? 'Saving…' : 'Save to Command Center'}
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 pt-4">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'shipments')} className="flex flex-col">
          <div className="px-6">
            <TabsList className="flex w-fit gap-1 rounded-full bg-slate-100 p-1">
              <TabsTrigger value="overview" className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900">
                Overview
              </TabsTrigger>
              <TabsTrigger value="shipments" className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900">
                Recent Shipments
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="px-6 pb-6 pt-4">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading company…
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <InfoItem label="Address" value={address ?? '—'} />
                  <InfoItem
                    label="Website"
                    value={website ? (
                      <a
                        href={normalizeWebsite(website)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:underline"
                      >
                        {stripProtocol(website)}
                      </a>
                    ) : (
                      '—'
                    )}
                  />
                  <InfoItem label="Phone" value={phone ?? '—'} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatTile label="Total Shipments" value={totalShipments} />
                  <StatTile label="Date Range" value={dateRange} />
                  <StatTile label="FCL %" value={loadMix.fcl} />
                  <StatTile label="LCL %" value={loadMix.lcl} />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="shipments" className="px-6 pb-6 pt-4">
            {loading && !detail ? (
              <div className="flex h-48 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading shipments…
              </div>
            ) : recentShipments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No shipments recorded yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="max-h-80 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">B/L</th>
                        <th className="px-4 py-3">Bill Type</th>
                        <th className="px-4 py-3">Country</th>
                        <th className="px-4 py-3 text-right">Weight (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {recentShipments.map((row, index) => (
                        <tr key={`${row?.Bill_of_Lading ?? index}-${index}`} className="text-slate-700">
                          <td className="whitespace-nowrap px-4 py-3">{formatShipmentDate(row?.date_formatted)}</td>
                          <td className="truncate px-4 py-3" title={row?.Bill_of_Lading ?? row?.Master_Bill_of_Lading ?? undefined}>
                            {row?.Bill_of_Lading ?? row?.Master_Bill_of_Lading ?? '—'}
                          </td>
                          <td className="px-4 py-3">{row?.Bill_Type_Code ?? '—'}</td>
                          <td className="px-4 py-3">{row?.Country ?? '—'}</td>
                          <td className="px-4 py-3 text-right">{formatNumber(row?.Weight_in_KG)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CompaniesModal({ open, company, onClose, onSave, saving = false, saved = false }: CompaniesModalProps) {
  if (!open || !company) {
    return null;
  }

  const shipments = formatNumber(company.shipments_12m);
  const lastActivity = formatLastActivity(company.last_activity);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg rounded-2xl bg-white p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-semibold text-slate-900">
                {company.company_name ?? 'Company'}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-500">ID: {company.company_id ?? '—'}</p>
            </div>
            <Button
              type="button"
              onClick={() => onSave?.(company)}
              disabled={saving || saved}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saved ? 'Saved' : saving ? 'Saving…' : 'Save to Command Center'}
            </Button>
          </div>
        </DialogHeader>

        <div className="mt-6 grid gap-3">
          <StatTile label="Shipments (12m)" value={shipments} />
          <StatTile label="Last activity" value={lastActivity} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{value}</div>
    </div>
  );
}

function buildLoadMix(detail: ImportYetiCompany | null) {
  const full = detail?.containers_load?.full;
  const less = detail?.containers_load?.less;
  const fclPerc = firstAvailableNumber(full?.shipments_perc, full?.teu_perc);
  const lclPerc = firstAvailableNumber(less?.shipments_perc, less?.teu_perc);
  return {
    fcl: formatPercent(fclPerc),
    lcl: formatPercent(lclPerc),
  };
}

function firstAvailableNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function formatPercent(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function formatNumber(value: unknown) {
  if (value == null) return '—';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat().format(numeric);
}

function formatDateRange(range?: { start_date?: string; end_date?: string }) {
  const start = range?.start_date ? formatDate(range.start_date) : null;
  const end = range?.end_date ? formatDate(range.end_date) : null;
  if (!start && !end) return '—';
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? '—';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function formatLastActivity(raw: SearchRow['last_activity']) {
  if (!raw) return '—';
  const value = typeof raw === 'object' && raw !== null && 'value' in raw ? (raw as any).value : raw;
  if (!value) return '—';
  return formatDate(String(value));
}

function formatShipmentDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

function normalizeWebsite(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

function stripProtocol(value: string) {
  return value.replace(/^https?:\/\//i, '');
}
