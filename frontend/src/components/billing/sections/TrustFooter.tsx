// Static trust footer. Powered-by-Stripe lockup with the Stripe brand
// purple, plus 4 trust pills and 3 legal links. The Terms/Privacy routes
// already exist in App.jsx; the dedicated billing-terms / tax-vat /
// refund-policy routes do not — those links use mailto fallbacks until
// real routes are added.

import { ShieldCheck, Lock, FileText, Users } from 'lucide-react';

const PILLS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { icon: Lock, label: 'Secure checkout' },
  { icon: Users, label: 'Role-based access' },
  { icon: FileText, label: 'Invoices managed securely' },
  { icon: ShieldCheck, label: 'SOC 2 Type II' },
];

const STRIPE_PURPLE = '#635BFF';

export function TrustFooter() {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-5 py-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-bold tracking-tight"
            style={{ color: STRIPE_PURPLE }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                fill={STRIPE_PURPLE}
                d="M13.5 9c0-.7.6-1 1.6-1 1.5 0 3.3.4 4.7 1.2V4.7C18.3 4.1 16.8 3.8 15 3.8c-4.1 0-6.9 2.2-6.9 5.8 0 5.6 7.5 4.7 7.5 7.1 0 .9-.8 1.2-1.8 1.2-1.7 0-3.8-.7-5.4-1.6v4.5c1.6.7 3.5 1 5.4 1 4.2 0 7-2.1 7-5.8 0-6-7.3-4.9-7.3-7z"
              />
            </svg>
            Powered by Stripe
          </span>
          <ul className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5">
            {PILLS.map((p) => (
              <li
                key={p.label}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500"
              >
                <p.icon className="h-3 w-3" />
                {p.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-x-[14px] gap-y-1 text-[11.5px]">
          <a
            href="mailto:support@logisticintel.com?subject=Billing%20terms"
            className="font-medium text-slate-500 transition hover:text-slate-900"
          >
            Billing terms
          </a>
          <a
            href="mailto:support@logisticintel.com?subject=Tax%20%26%20VAT"
            className="font-medium text-slate-500 transition hover:text-slate-900"
          >
            Tax &amp; VAT
          </a>
          <a
            href="mailto:support@logisticintel.com?subject=Refund%20policy"
            className="font-medium text-slate-500 transition hover:text-slate-900"
          >
            Refund policy
          </a>
        </div>
      </div>
    </div>
  );
}