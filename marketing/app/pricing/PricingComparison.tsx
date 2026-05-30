import { Check, Minus } from "lucide-react";

/**
 * Full feature matrix across Starter / Growth / Scale. Server component —
 * no interactivity. Grouped by category. Cells render either a check, an
 * em-dash (not included), or a short string ("5,000 / mo").
 */

type Cell = true | false | string;
type Row = { label: string; starter: Cell; growth: Cell; scale: Cell };
type Group = { category: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    category: "Data",
    rows: [
      { label: "U.S. customs shipment search", starter: true, growth: true, scale: true },
      { label: "Lane and shipper alerts", starter: true, growth: true, scale: true },
      { label: "Verified contact reveals", starter: "1,000 / mo", growth: "5,000 / mo", scale: "Unlimited" },
      { label: "Pulse AI account briefs", starter: "50 / mo", growth: "500 / mo", scale: "Unlimited" },
      { label: "Custom data feeds", starter: false, growth: false, scale: true },
    ],
  },
  {
    category: "Outreach",
    rows: [
      { label: "Email outbound", starter: true, growth: true, scale: true },
      { label: "LinkedIn outbound", starter: false, growth: true, scale: true },
      { label: "Sequences and cadences", starter: false, growth: true, scale: true },
      { label: "Reply detection", starter: false, growth: true, scale: true },
    ],
  },
  {
    category: "CRM",
    rows: [
      { label: "Saved companies", starter: true, growth: true, scale: true },
      { label: "Command Center with shipment context", starter: false, growth: true, scale: true },
      { label: "Pipeline stages and forecasting", starter: false, growth: true, scale: true },
    ],
  },
  {
    category: "Integrations",
    rows: [
      { label: "HubSpot sync", starter: false, growth: true, scale: true },
      { label: "Salesforce sync", starter: false, growth: true, scale: true },
      { label: "Snowflake / warehouse sync", starter: false, growth: false, scale: true },
      { label: "API access", starter: false, growth: true, scale: true },
    ],
  },
  {
    category: "Admin",
    rows: [
      { label: "User seats included", starter: "1", growth: "5", scale: "Custom" },
      { label: "Additional seat pricing", starter: "—", growth: "$99 / seat / mo", scale: "Custom" },
      { label: "SSO (SAML / OIDC)", starter: false, growth: false, scale: true },
      { label: "SCIM provisioning", starter: false, growth: false, scale: true },
      { label: "Audit log", starter: false, growth: true, scale: true },
    ],
  },
  {
    category: "Support",
    rows: [
      { label: "Email support", starter: true, growth: true, scale: true },
      { label: "Priority support", starter: false, growth: true, scale: true },
      { label: "Dedicated CSM", starter: false, growth: false, scale: true },
      { label: "SLA-backed response", starter: false, growth: false, scale: true },
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
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-ink-100">
                <th
                  scope="col"
                  className="font-display w-[40%] px-6 py-5 text-left text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500"
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
              </tr>
            </thead>
            <tbody>
              {GROUPS.flatMap((group) => [
                <tr key={`g-${group.category}`} className="bg-ink-25">
                  <th
                    scope="rowgroup"
                    colSpan={4}
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
