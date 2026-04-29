// Invoices section. There is no live invoice fetch in the app today —
// invoices are owned by Stripe. Render the design's empty state with a
// portal CTA. If invoice rows ever land in a hook, render the table
// from this prop set.

import { ExternalLink, Receipt } from 'lucide-react';

export interface InvoiceRow {
  id: string;
  date: string;
  number: string;
  description: string;
  amount: string;
  status: 'paid' | 'open' | 'failed' | 'past_due' | 'refunded' | 'void';
  hostedUrl?: string | null;
  pdfUrl?: string | null;
}

const STATUS_CHIP: Record<InvoiceRow['status'], string> = {
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  open: 'bg-blue-100 text-blue-700 border-blue-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  past_due: 'bg-red-100 text-red-700 border-red-200',
  refunded: 'bg-slate-100 text-slate-700 border-slate-200',
  void: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_LABEL: Record<InvoiceRow['status'], string> = {
  paid: 'Paid',
  open: 'Open',
  failed: 'Failed',
  past_due: 'Failed',
  refunded: 'Refunded',
  void: 'Void',
};

interface Props {
  invoices: InvoiceRow[]; // empty array → render empty state
  hasStripeCustomer: boolean;
  canManage: boolean;
  onOpenPortal: () => void;
  isLoading?: boolean;
}

export function BillingInvoices({ invoices, hasStripeCustomer, canManage, onOpenPortal, isLoading }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
            Invoices
          </span>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">
            Billing history
          </h3>
        </div>
        {hasStripeCustomer && canManage ? (
          <button
            type="button"
            onClick={onOpenPortal}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {isLoading ? 'Opening…' : 'Open Stripe portal'}
          </button>
        ) : null}
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Receipt className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-slate-900">Invoices managed in Stripe</p>
          <p className="max-w-md text-sm text-slate-600">
            Open your Stripe Customer Portal to view, download, or dispute every invoice.
          </p>
          {hasStripeCustomer && canManage ? (
            <button
              type="button"
              onClick={onOpenPortal}
              disabled={isLoading}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <ExternalLink className="h-4 w-4" />
              {isLoading ? 'Opening…' : 'Open portal'}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="hidden px-4 py-3 md:table-cell">Number</th>
                <th className="hidden px-4 py-3 md:table-cell">Description</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="bg-white">
                  <td className="px-4 py-3 font-medium text-slate-900">{inv.date}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{inv.number}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{inv.description}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{inv.amount}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[inv.status]}`}>
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.hostedUrl ? (
                      <a
                        href={inv.hostedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                      >
                        View <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}