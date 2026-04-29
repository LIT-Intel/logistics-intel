// Static trust footer. Powered-by-Stripe lockup + 4 trust pills + 3
// footer links. The Terms/Privacy routes already exist in App.jsx;
// the dedicated billing-terms / tax-vat / refund-policy routes do not
// — those links use mailto fallbacks until real routes are added.

import { ShieldCheck, Lock, FileText, BadgeCheck } from 'lucide-react';

const PILLS = [
  { icon: Lock, label: 'Secure checkout' },
  { icon: ShieldCheck, label: 'Role-based access' },
  { icon: FileText, label: 'Invoices managed securely' },
  { icon: BadgeCheck, label: 'SOC 2 Type II' },
];

export function TrustFooter() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold tracking-tight text-slate-700">
              Stripe
            </span>
            Powered by Stripe
          </span>
          <span className="hidden h-4 w-px bg-slate-300 sm:inline-block" />
          <ul className="flex flex-wrap gap-2">
            {PILLS.map((p) => (
              <li
                key={p.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              >
                <p.icon className="h-3.5 w-3.5 text-emerald-600" />
                {p.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {/* Real routes are pending — using mailto fallbacks for now. */}
          <a
            href="mailto:support@logisticintel.com?subject=Billing%20terms"
            className="font-semibold text-slate-600 hover:text-slate-900"
          >
            Billing terms
          </a>
          <a
            href="mailto:support@logisticintel.com?subject=Tax%20%26%20VAT"
            className="font-semibold text-slate-600 hover:text-slate-900"
          >
            Tax &amp; VAT
          </a>
          <a
            href="mailto:support@logisticintel.com?subject=Refund%20policy"
            className="font-semibold text-slate-600 hover:text-slate-900"
          >
            Refund policy
          </a>
        </div>
      </div>
    </div>
  );
}