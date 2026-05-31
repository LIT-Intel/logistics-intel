import { Check, Minus } from "lucide-react";

/**
 * Full feature matrix across Starter / Growth / Scale / Enterprise.
 * Server component — no interactivity. Grouped by category. Cells
 * render either a check, an em-dash (not included), or a short string
 * ("150 / mo", "Unlimited", "Custom").
 *
 * Numeric cells reflect the real per-tier limits from the Supabase
 * `plans` table as of 2026-05-31. Only the Enterprise row carries
 * "Unlimited" treatments — Scale has finite caps in the DB and must
 * not claim unlimited usage.
 */

type Cell = true | false | string;
type Row = {
  label: string;
  starter: Cell;
  growth: Cell;
  scale: Cell;
  enterprise: Cell;
};
type Group = { category: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    category: "Data",
    rows: [
      { label: "U.S. customs shipment search", starter: "75 / mo", growth: "350 / mo", scale: "1,000 / mo", enterprise: "Unlimited" },
      { label: "Saved companies", starter: "50", growth: "350", scale: "1,000", enterprise: "Unlimited" },
      { label: "Lane and shipper alerts", starter: true, growth: true, scale: true, enterprise: true },
      { label: "Verified contact reveals", starter: false, growth: "150 / mo", scale: "500 / mo", enterprise: "Unlimited" },
      { label: "Pulse AI account briefs", starter: "25 / mo", growth: "100 / mo", scale: "500 / mo", enterprise: "Unlimited" },
      { label: "Market benchmark analytics", starter: false, growth: false, scale: false, enterprise: true },
      { label: "Custom data feeds", starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
  {
    category: "Outreach",
    rows: [
      { label: "Campaign email sends", starter: "250 / mo", growth: "1,000 / mo", scale: "2,500 / mo", enterprise: "Unlimited" },
      { label: "LinkedIn touches", starter: "75 / mo", growth: "250 / mo", scale: "750 / mo", enterprise: "Unlimited" },
      { label: "Sequences and cadences", starter: true, growth: true, scale: true, enterprise: true },
      { label: "Reply detection", starter: false, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: "CRM",
    rows: [
      { label: "Saved contacts", starter: false, growth: "250", scale: "1,000", enterprise: "Unlimited" },
      { label: "Command Center with shipment context", starter: false, growth: true, scale: true, enterprise: true },
      { label: "Pipeline stages and forecasting", starter: false, growth: true, scale: true, enterprise: true },
      { label: "CSV exports", starter: "10 / mo", growth: "50 / mo", scale: "100 / mo", enterprise: "Unlimited" },
    ],
  },
  {
    category: "Integrations",
    rows: [
      { label: "HubSpot sync", starter: false, growth: true, scale: true, enterprise: true },
      { label: "Salesforce sync", starter: false, growth: true, scale: true, enterprise: true },
      { label: "Snowflake / warehouse sync", starter: false, growth: false, scale: false, enterprise: true },
      { label: "API access", starter: false, growth: true, scale: true, enterprise: true },
      { label: "Custom integrations", starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
  {
    category: "Admin",
    rows: [
      { label: "User seats included", starter: "1", growth: "3", scale: "5", enterprise: "10+ custom" },
      { label: "Additional seat pricing", starter: "—", growth: "$99 / seat / mo", scale: "$99 / seat / mo", enterprise: "Custom" },
      { label: "SSO (SAML / OIDC)", starter: false, growth: false, scale: false, enterprise: true },
      { label: "SCIM provisioning", starter: false, growth: false, scale: false, enterprise: true },
      { label: "Audit log", starter: false, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: "Support",
    rows: [
      { label: "Email support", starter: true, growth: true, scale: true, enterprise: true },
      { label: "Priority support", starter: false, growth: true, scale: true, enterprise: true },
      { label: "Dedicated CSM", starter: false, growth: false, scale: false, enterprise: true },
      { label: "SLA-backed response", starter: false, growth: false, scale: true, enterprise: true },
      { label: "Named technical account manager", starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
];

function CellRender({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <Check className="mx-auto h-4 w-4 text-brand-blue" aria-label="Included" />
    );
  }
  if (value === false) {
    return (
      <Minus className="mx-auto h-4 w-4 text-ink-200" aria-label="Not included" />
    );
  }
  return (
    <span className="font-body text-[13px] text-ink-700">{value}</span>
  );
}

export function PricingComparison() {
  return (
    <section className="px-5 sm:px-8 py-16">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">Compare plans</div>
          <h2 className="display-lg mt-3">Every capability, side by side.</h2>
        </div>

        <div className="mt-10 overflow-x-auto rounded-3xl border border-ink-100 bg-white shadow-sm">
          <table className="w-full min-w-[860px] border-collapse">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-ink-100">
                <th
                  scope="col"
                  className="font-display w-[34%] px-6 py-5 text-left text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500"
                >
                  Feature
                </th>
                <th
                  scope="col"
                  className="font-display px-6 py-5 text-center text-[14px] font-semibold text-ink-900"
                >
                  Starter
                </th>
                <th
                  scope="col"
                  className="font-display px-6 py-5 text-center text-[14px] font-semibold text-brand-blue-700"
                >
                  Growth
                </th>
                <th
                  scope="col"
                  className="font-display px-6 py-5 text-center text-[14px] font-semibold text-ink-900"
                >
                  Scale
                </th>
                <th
                  scope="col"
                  className="font-display px-6 py-5 text-center text-[14px] font-semibold text-ink-900"
                >
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.flatMap((group) => [
                <tr key={`g-${group.category}`} className="bg-ink-25">
                  <th
                    scope="rowgroup"
                    colSpan={5}
                    className="font-display px-6 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500"
                  >
                    {group.category}
                  </th>
                </tr>,
                ...group.rows.map((row, i) => (
                  <tr
                    key={`${group.category}-${i}`}
                    className="border-t border-ink-100"
                  >
                    <th
                      scope="row"
                      className="font-body px-6 py-4 text-left text-[14px] font-normal text-ink-900"
                    >
                      {row.label}
                    </th>
                    <td className="px-6 py-4 text-center">
                      <CellRender value={row.starter} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CellRender value={row.growth} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CellRender value={row.scale} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CellRender value={row.enterprise} />
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
